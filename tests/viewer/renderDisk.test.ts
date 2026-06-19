// tests/viewer/renderDisk.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderViewerToDisk } from '../../src/viewer/render.js'
import { writeConcept } from '../../src/store/conceptStore.js'
import { writeFeature } from '../../src/store/featureStore.js'
import { writeMappingCache } from '../../src/mapping/scan.js'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })

const viewer = (rel: string) => join(root, 'docs/conceptpowers/concepts/viewer', rel)

it('단일 SPA 에셋(index.html, viewer.js, serve.mjs, css)을 디스크에 쓴다', async () => {
  await renderViewerToDisk(root)
  expect(existsSync(viewer('index.html'))).toBe(true)
  expect(existsSync(viewer('assets/viewer.js'))).toBe(true)
  expect(existsSync(viewer('serve.mjs'))).toBe(true)
  expect(existsSync(viewer('assets/concept.css'))).toBe(true)
})

it('개념마다 HTML 파일을 만들지 않는다', async () => {
  await writeConcept(root, {
    slug: 'admin-role', group: 'auth', category: ['role'], title: 'Admin Role',
    description: { definition: 'd' }, purpose: { reason: 'r' }, actions: {}, principle: {}
  })
  await renderViewerToDisk(root)
  expect(existsSync(viewer('auth/admin-role.html'))).toBe(false)
})

it('manifest.json에 개념/기능의 원본 JSON URL과 그래프가 담긴다', async () => {
  await writeConcept(root, {
    slug: 'admin-role', group: 'auth', category: ['role'], title: 'Admin Role',
    description: { definition: 'd' }, purpose: { reason: 'r' }, actions: {}, principle: {}
  })
  await writeFeature(root, { slug: 'login', title: 'Login', concepts: ['admin-role'], codePaths: ['src/a.ts'] })
  await renderViewerToDisk(root)
  const m = JSON.parse(readFileSync(viewer('manifest.json'), 'utf8'))
  expect(m.concepts[0].url).toBe('../data/auth/admin-role.json')
  expect(m.features[0].url).toBe('../../features/login.json')
  expect(m.graph.edges.some((e: { target: string }) => e.target === 'c:admin-role')).toBe(true)
})

it('mapping.json(@concept→코드)이 개념→파일 그래프 엣지와 codeLinks로 반영된다', async () => {
  await writeConcept(root, {
    slug: 'admin-role', group: 'auth', category: ['role'], title: 'Admin Role',
    description: { definition: 'd' }, purpose: { reason: 'r' }, actions: {}, principle: {}
  })
  await writeMappingCache(root, { 'admin-role': ['src/admin.ts'] })
  await renderViewerToDisk(root)
  const m = JSON.parse(readFileSync(viewer('manifest.json'), 'utf8'))
  expect(m.concepts[0].codeLinks).toContain('src/admin.ts')
  expect(m.graph.edges.some((e: { source: string; target: string; kind: string }) =>
    e.source === 'c:admin-role' && e.target === 'p:src/admin.ts' && e.kind === 'concept-file'
  )).toBe(true)
})

it('렌더링된 CSS에 badge--pending 규칙이 포함된다', async () => {
  await renderViewerToDisk(root)
  const css = readFileSync(viewer('assets/concept.css'), 'utf8')
  expect(css).toContain('badge--pending')
})

it('viewer.js와 index.html이 서로를 참조한다', async () => {
  await renderViewerToDisk(root)
  expect(readFileSync(viewer('index.html'), 'utf8')).toContain('assets/viewer.js')
})
