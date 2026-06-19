// tests/viewer/serve.test.ts
// 정적 서버(assets/serve.mjs)의 순수 헬퍼와 부팅 동작을 검증한다.
import { describe, it, expect } from 'vitest'
import { resolve, sep } from 'node:path'
// @ts-expect-error — 의존성 0 런타임 에셋(.mjs), 타입 선언 없음
import { contentType, safeResolve, browserCommand, startServer } from '../../assets/serve.mjs'

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

describe('startServer', () => {
  it('파일을 http로 서빙한다(브라우저 미오픈)', async () => {
    const root = resolve('assets') // 이 레포의 assets/ 자체를 서빙해 본다
    const { server, url } = await startServer({ root, ports: [0], open: false })
    try {
      const res = await fetch(url + 'serve.mjs')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/javascript')
    } finally {
      server.close()
    }
  })
})
