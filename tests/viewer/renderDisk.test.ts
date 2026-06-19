// tests/viewer/renderDisk.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderViewerToDisk } from '../../src/viewer/render.js'
import { writeConcept } from '../../src/store/conceptStore.js'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })

it('개념 데이터를 읽어 뷰어 HTML과 CSS를 디스크에 쓴다', async () => {
  await writeConcept(root, {
    slug: 'admin-role', group: 'auth', category: ['role'], title: 'Admin Role',
    description: { definition: 'd' }, purpose: { reason: 'r' }, actions: {}, principle: {}
  })
  await renderViewerToDisk(root)
  expect(existsSync(join(root, 'docs/conceptpowers/concepts/viewer/index.html'))).toBe(true)
  expect(existsSync(join(root, 'docs/conceptpowers/concepts/viewer/auth/admin-role.html'))).toBe(true)
  expect(readFileSync(join(root, 'docs/conceptpowers/concepts/viewer/index.html'), 'utf8')).toContain('Admin Role')
  expect(existsSync(join(root, 'docs/conceptpowers/concepts/viewer/assets/concept.css'))).toBe(true)
})

it('렌더링된 CSS에 badge--pending 규칙이 포함된다', async () => {
  await renderViewerToDisk(root)
  const css = readFileSync(join(root, 'docs/conceptpowers/concepts/viewer/assets/concept.css'), 'utf8')
  expect(css).toContain('badge--pending')
})
