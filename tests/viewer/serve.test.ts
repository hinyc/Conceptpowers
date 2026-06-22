// tests/viewer/serve.test.ts
// 뷰어 서버(src/viewer/serve.ts)의 순수 헬퍼·부팅 동작과 쓰기 API 라우터를 검증한다.
// 배포본 assets/serve.mjs는 이 소스를 esbuild로 번들한 산출물이다.
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, sep, join } from 'node:path'
import {
  contentType, safeResolve, browserCommand, startServer, isLocalRequest, handleApi, type ApiRequest,
} from '../../src/viewer/serve.js'
import { writeConcept, readConcept } from '../../src/store/conceptStore.js'

describe('contentType', () => {
  it('확장자별 MIME을 반환한다', () => {
    expect(contentType('a.html')).toContain('text/html')
    expect(contentType('a.json')).toContain('application/json')
    expect(contentType('a.css')).toContain('text/css')
    expect(contentType('a.js')).toContain('text/javascript')
  })
  it('알 수 없는 확장자는 octet-stream', () => {
    expect(contentType('a.bin')).toBe('application/octet-stream')
  })
})

describe('safeResolve', () => {
  const root = resolve('/tmp/viewer')
  it("'/'는 index.html로 매핑한다", () => {
    expect(safeResolve(root, '/')).toBe(root + sep + 'index.html')
  })
  it('쿼리/해시를 제거한다', () => {
    expect(safeResolve(root, '/manifest.json?x=1#a')).toBe(root + sep + 'manifest.json')
  })
  it('디렉터리 탈출은 null', () => {
    expect(safeResolve(root, '/../../etc/passwd')).toBeNull()
    expect(safeResolve(root, '/..%2f..%2fsecret')).toBeNull()
  })
  it('잘못된 인코딩/널바이트/닷파일은 null (throw 금지)', () => {
    expect(safeResolve(root, '/%')).toBeNull()
    expect(safeResolve(root, '/a%00b')).toBeNull()
    expect(safeResolve(root, '/.cache/mapping.json')).toBeNull()
    expect(safeResolve(root, '/.alignment/history.json')).toBeNull()
  })
})

describe('browserCommand', () => {
  it('플랫폼별 명령을 만든다', () => {
    expect(browserCommand('darwin', 'http://x').cmd).toBe('open')
    expect(browserCommand('win32', 'http://x').cmd).toBe('cmd')
    expect(browserCommand('linux', 'http://x').cmd).toBe('xdg-open')
  })
})

describe('isLocalRequest', () => {
  it('localhost/127.0.0.1만 허용한다', () => {
    expect(isLocalRequest({ host: 'localhost:4173' })).toBe(true)
    expect(isLocalRequest({ host: '127.0.0.1:4173' })).toBe(true)
    expect(isLocalRequest({ host: '[::1]:4173' })).toBe(true)
    expect(isLocalRequest({ host: 'evil.com' })).toBe(false)
  })
  it('빈/누락 Host는 거부한다', () => {
    expect(isLocalRequest({ host: '' })).toBe(false)
    expect(isLocalRequest({})).toBe(false)
  })
})

describe('startServer', () => {
  it('파일을 http로 서빙한다(브라우저 미오픈)', async () => {
    const root = resolve('assets') // 이 레포의 assets/ 자체를 서빙해 본다
    const { server, url } = await startServer({ root, ports: [0], open: false })
    try {
      const res = await fetch(url + 'concept.css')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/css')
    } finally {
      server.close()
    }
  })
  it('projectRoot 없이는 /api/* 가 비활성(404)이다', async () => {
    const root = resolve('assets')
    const { server, url } = await startServer({ root, ports: [0], open: false })
    try {
      const res = await fetch(url + 'api/health')
      expect(res.status).toBe(404)
    } finally {
      server.close()
    }
  })
})

describe('handleApi', () => {
  let root: string
  const base = {
    slug: 'admin-role', group: 'auth', category: ['role'], title: 'Admin Role',
    description: { definition: 'd' }, purpose: { reason: 'r' }, actions: {}, principle: {},
  }
  const req = (over: Partial<ApiRequest>): ApiRequest =>
    ({ method: 'GET', url: '/', headers: { host: 'localhost:4173' }, body: '', ...over })

  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })

  it('GET /api/health → editable', async () => {
    const r = await handleApi(root, req({ method: 'GET', url: '/api/health' }))
    expect(r.status).toBe(200)
    expect((r.json as { editable: boolean }).editable).toBe(true)
  })

  it('POST status: red→green 승인 + 디스크 반영', async () => {
    await writeConcept(root, base as never)
    const r = await handleApi(root, req({
      method: 'POST', url: '/api/concept/admin-role/status', body: JSON.stringify({ status: 'green' }),
    }))
    expect(r.status).toBe(200)
    expect((await readConcept(root, 'admin-role'))?.status).toBe('green')
  })

  it('POST status: 가드 위반(green→red)은 400', async () => {
    await writeConcept(root, { ...base, status: 'green' } as never)
    const r = await handleApi(root, req({
      method: 'POST', url: '/api/concept/admin-role/status', body: JSON.stringify({ status: 'red' }),
    }))
    expect(r.status).toBe(400)
  })

  it('POST status: 없는 개념은 404', async () => {
    const r = await handleApi(root, req({
      method: 'POST', url: '/api/concept/ghost/status', body: JSON.stringify({ status: 'green' }),
    }))
    expect(r.status).toBe(404)
  })

  it('POST status: 잘못된 status 값은 400', async () => {
    await writeConcept(root, base as never)
    const r = await handleApi(root, req({
      method: 'POST', url: '/api/concept/admin-role/status', body: JSON.stringify({ status: 'blue' }),
    }))
    expect(r.status).toBe(400)
  })

  it('PUT 내용 편집: green이면 pending으로 내려가고 downgradedToPending=true', async () => {
    await writeConcept(root, { ...base, status: 'green' } as never)
    const r = await handleApi(root, req({
      method: 'PUT', url: '/api/concept/admin-role', body: JSON.stringify({ patch: { title: 'New' } }),
    }))
    expect(r.status).toBe(200)
    expect((r.json as { downgradedToPending: boolean }).downgradedToPending).toBe(true)
    expect((await readConcept(root, 'admin-role'))?.status).toBe('pending')
    expect((await readConcept(root, 'admin-role'))?.title).toBe('New')
  })

  it('PUT 내용 편집: 스키마 위반은 400', async () => {
    await writeConcept(root, base as never)
    const r = await handleApi(root, req({
      method: 'PUT', url: '/api/concept/admin-role',
      body: JSON.stringify({ patch: { description: { definition: '' } } }),
    }))
    expect(r.status).toBe(400)
  })

  it('비로컬 Host의 변경 요청은 403', async () => {
    await writeConcept(root, base as never)
    const r = await handleApi(root, req({
      method: 'POST', url: '/api/concept/admin-role/status',
      headers: { host: 'evil.com' }, body: JSON.stringify({ status: 'green' }),
    }))
    expect(r.status).toBe(403)
  })

  it('잘못된 메서드는 405', async () => {
    const r = await handleApi(root, req({ method: 'DELETE', url: '/api/concept/admin-role' }))
    expect(r.status).toBe(405)
  })

  it('알 수 없는 경로는 404', async () => {
    const r = await handleApi(root, req({ method: 'GET', url: '/api/unknown' }))
    expect(r.status).toBe(404)
  })

  it('잘못된 JSON 본문은 400', async () => {
    await writeConcept(root, base as never)
    const r = await handleApi(root, req({
      method: 'POST', url: '/api/concept/admin-role/status', body: '{nope',
    }))
    expect(r.status).toBe(400)
  })
})
