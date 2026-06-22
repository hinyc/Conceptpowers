// tests/store/conceptStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeConcept, listConcepts, readConcept, slugExists, setConceptStatus, editConceptContent } from '../../src/store/conceptStore.js'

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

describe('editConceptContent', () => {
  it('본문 필드를 불변으로 교체한다', async () => {
    await writeConcept(root, { ...base, status: 'pending' } as any)
    const updated = await editConceptContent(root, 'admin-role', {
      title: 'New Title',
      actions: { allow: ['x'], restrict: ['y'], interaction: '' },
    })
    expect(updated.title).toBe('New Title')
    expect(updated.actions.allow).toEqual(['x'])
    expect((await readConcept(root, 'admin-role'))?.title).toBe('New Title')
  })
  it('green 개념을 편집하면 pending으로 내려간다(재검증 유도)', async () => {
    await writeConcept(root, { ...base, status: 'green' } as any)
    const updated = await editConceptContent(root, 'admin-role', { title: 'Edited' })
    expect(updated.status).toBe('pending')
  })
  it('pending/red 개념은 편집해도 상태를 유지한다', async () => {
    await writeConcept(root, { ...base, status: 'pending' } as any)
    expect((await editConceptContent(root, 'admin-role', { title: 'a' })).status).toBe('pending')
    await writeConcept(root, { ...base, status: 'red' } as any)
    expect((await editConceptContent(root, 'admin-role', { title: 'b' })).status).toBe('red')
  })
  it('slug/group/status 변경 시도는 무시한다', async () => {
    await writeConcept(root, { ...base, status: 'green' } as any)
    const updated = await editConceptContent(root, 'admin-role', {
      // @ts-expect-error — 화이트리스트 밖 필드는 타입상으로도 막힌다
      slug: 'hacked', group: 'evil', status: 'green', title: 'ok',
    })
    expect(updated.slug).toBe('admin-role')
    expect(updated.group).toBe('auth')
    expect(updated.status).toBe('pending') // green→pending (status 패치는 무시)
    expect(updated.title).toBe('ok')
  })
  it('스키마 위반(빈 definition)은 거부한다', async () => {
    await writeConcept(root, base as any)
    await expect(
      editConceptContent(root, 'admin-role', { description: { definition: '', analogy: '', components: [], example: '' } }),
    ).rejects.toThrow()
  })
  it('런타임 임의 키(타입 우회)는 무시한다', async () => {
    await writeConcept(root, base as any)
    const updated = await editConceptContent(root, 'admin-role', { hacked: 'x', title: 'ok' } as any)
    expect(updated.title).toBe('ok')
    expect((updated as any).hacked).toBeUndefined()
  })
  it('없는 개념은 에러를 던진다', async () => {
    await expect(editConceptContent(root, 'ghost', { title: 'x' })).rejects.toThrow('not found')
  })
})
