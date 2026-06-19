// tests/store/conceptStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeConcept, listConcepts, readConcept, slugExists, setConceptStatus } from '../../src/store/conceptStore.js'

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
  it('setConceptStatus가 status를 불변으로 갱신한다', async () => {
    await writeConcept(root, base as any)
    expect((await readConcept(root, 'admin-role'))?.status).toBe('red')
    const updated = await setConceptStatus(root, 'admin-role', 'green')
    expect(updated.status).toBe('green')
    expect(updated.title).toBe('Admin Role') // 나머지 보존
    expect((await readConcept(root, 'admin-role'))?.status).toBe('green')
  })
  it('setConceptStatus는 없는 개념에 대해 에러를 던진다', async () => {
    await expect(setConceptStatus(root, 'ghost', 'green')).rejects.toThrow('not found')
  })
  it('settled green은 다른 상태로 전이할 수 없다(가드)', async () => {
    await writeConcept(root, { ...base, status: 'green' } as any)
    await expect(setConceptStatus(root, 'admin-role', 'red')).rejects.toThrow(/transition/i)
    await expect(setConceptStatus(root, 'admin-role', 'pending')).rejects.toThrow(/transition/i)
  })
  it('settled red는 pending으로 되돌릴 수 없다(red→green만 허용)', async () => {
    await writeConcept(root, base as any) // 기본 red
    await expect(setConceptStatus(root, 'admin-role', 'pending')).rejects.toThrow(/transition/i)
  })
  it('pending은 green/red로 정착할 수 있다', async () => {
    await writeConcept(root, { ...base, status: 'pending' } as any)
    await expect(setConceptStatus(root, 'admin-role', 'red')).resolves.toBeTruthy()
    await writeConcept(root, { ...base, status: 'pending' } as any)
    expect((await setConceptStatus(root, 'admin-role', 'green')).status).toBe('green')
  })
  it('동일 상태로의 전이는 허용한다(idempotent)', async () => {
    await writeConcept(root, { ...base, status: 'green' } as any)
    expect((await setConceptStatus(root, 'admin-role', 'green')).status).toBe('green')
  })
})
