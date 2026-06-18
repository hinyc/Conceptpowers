// tests/store/conceptStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeConcept, listConcepts, readConcept, slugExists } from '../../src/store/conceptStore.js'

const base = {
  slug: 'admin-role', group: 'auth', category: ['role'], title: 'Admin Role',
  description: { definition: 'd' }, purpose: { reason: 'r' },
  actions: {}, principle: {}
}
let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })

describe('conceptStore', () => {
  it('개념을 그룹 폴더에 쓰고 다시 읽는다', async () => {
    await writeConcept(root, base as any)
    const read = await readConcept(root, 'admin-role')
    expect(read?.title).toBe('Admin Role')
  })
  it('모든 개념을 그룹 하위까지 재귀로 나열한다', async () => {
    await writeConcept(root, base as any)
    await writeConcept(root, { ...base, slug: 'user-role', group: 'auth' } as any)
    await writeConcept(root, { ...base, slug: 'token-meter', group: 'billing' } as any)
    const all = await listConcepts(root)
    expect(all.map(c => c.slug).sort()).toEqual(['admin-role', 'token-meter', 'user-role'])
  })
  it('slug 존재 여부를 전역으로 판단한다 (그룹 무관)', async () => {
    await writeConcept(root, base as any)
    expect(await slugExists(root, 'admin-role')).toBe(true)
    expect(await slugExists(root, 'nope')).toBe(false)
  })
  it('다른 그룹에 동일 slug 쓰기를 거부한다 (I1)', async () => {
    await writeConcept(root, { ...base, slug: 'admin-role', group: 'auth' } as any)
    await expect(
      writeConcept(root, { ...base, slug: 'admin-role', group: 'billing' } as any)
    ).rejects.toThrow('Duplicate slug')
  })
  it('동일 경로에 동일 slug 덮어쓰기는 허용한다 (I1)', async () => {
    await writeConcept(root, { ...base, slug: 'admin-role', group: 'auth', title: 'v1' } as any)
    await expect(
      writeConcept(root, { ...base, slug: 'admin-role', group: 'auth', title: 'v2' } as any)
    ).resolves.not.toThrow()
    const updated = await readConcept(root, 'admin-role')
    expect(updated?.title).toBe('v2')
  })
})
