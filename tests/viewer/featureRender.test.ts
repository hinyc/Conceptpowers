// tests/viewer/featureRender.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderViewer, renderViewerToDisk } from '../../src/viewer/render.js'
import { writeConcept } from '../../src/store/conceptStore.js'
import { writeFeature } from '../../src/store/featureStore.js'
import type { Concept } from '../../src/schema/concept.js'
import type { Feature } from '../../src/schema/feature.js'

const c: Concept = {
  slug: 'auth', group: '', category: ['role'], title: 'Auth', eyebrow: '',
  description: { definition: '인증', analogy: '', components: [], example: '' },
  purpose: { reason: 'r', benefits: [], vision: '', painPoints: [] },
  actions: { allow: [], restrict: [], interaction: '' },
  principle: { immutableRules: [], tradeoffs: '', lifecycle: [] },
  relations: { prev: '', next: '', related: [] }, codeLinks: []
} as Concept

const f: Feature = { slug: 'user-login', group: '', title: 'User Login', description: '로그인', concepts: ['auth'], codePaths: ['src/auth/login.ts'] } as Feature

describe('renderViewer (features)', () => {
  it('기능 페이지(features/…)와 graph.html을 생성한다', () => {
    const out = renderViewer([c], 'ko', [f])
    expect(Object.keys(out)).toContain('features/user-login.html')
    expect(Object.keys(out)).toContain('graph.html')
  })
  it('기능 페이지에 관련 개념 링크와 구현 경로를 포함한다', () => {
    const out = renderViewer([c], 'ko', [f])
    const page = out['features/user-login.html']
    expect(page).toContain('src/auth/login.ts')
    expect(page).toContain('../auth.html') // 관련 개념 링크 (역방향 상대경로)
  })
  it('개념 페이지에 역방향으로 관련 기능 링크를 포함한다', () => {
    const out = renderViewer([c], 'ko', [f])
    const page = out['auth.html']
    expect(page).toContain('features/user-login.html')
    expect(page).toContain('User Login')
  })
  it('기능 페이지 CSS href는 상위 경로를 가리킨다', () => {
    const out = renderViewer([c], 'ko', [f])
    expect(out['features/user-login.html']).toContain('href="../assets/concept.css"')
  })
})

describe('renderViewerToDisk (features)', () => {
  let root: string
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })
  it('기능 데이터를 읽어 기능 페이지와 graph.html을 디스크에 쓴다', async () => {
    await writeConcept(root, { slug: 'auth', category: ['role'], title: 'Auth', description: { definition: 'd' }, purpose: { reason: 'r' }, actions: {}, principle: {} })
    await writeFeature(root, { slug: 'user-login', title: 'User Login', concepts: ['auth'], codePaths: ['src/auth/login.ts'] })
    await renderViewerToDisk(root)
    const v = join(root, 'docs/conceptpowers/concepts/viewer')
    expect(existsSync(join(v, 'features/user-login.html'))).toBe(true)
    expect(existsSync(join(v, 'graph.html'))).toBe(true)
    expect(readFileSync(join(v, 'features/user-login.html'), 'utf8')).toContain('src/auth/login.ts')
  })
})
