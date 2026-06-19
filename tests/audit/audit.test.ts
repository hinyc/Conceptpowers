// tests/audit/audit.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { auditIntegrity } from '../../src/audit/audit.js'
import { writeConcept } from '../../src/store/conceptStore.js'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'))
  mkdirSync(join(root, 'src'), { recursive: true })
})

describe('auditIntegrity', () => {
  it('존재하는 개념을 가리키는 태그는 통과한다', async () => {
    await writeConcept(root, { slug: 'admin-role', category: ['role'], title: 'A', description: { definition: 'd' }, purpose: { reason: 'r' }, actions: {}, principle: {} })
    writeFileSync(join(root, 'src/a.ts'), '// @concept:admin-role\n')
    const r = await auditIntegrity(root, ['src/a.ts'])
    expect(r.unknownTags).toEqual([])
    expect(r.ok).toBe(true)
  })
  it('없는 개념을 가리키는 태그를 unknownTags로 보고한다', async () => {
    writeFileSync(join(root, 'src/a.ts'), '// @concept:ghost\n')
    const r = await auditIntegrity(root, ['src/a.ts'])
    expect(r.unknownTags).toEqual([{ slug: 'ghost', file: 'src/a.ts' }])
    expect(r.ok).toBe(false)
  })
  it('미승인(red) 개념을 unapproved로 보고하지만 ok는 막지 않는다', async () => {
    await writeConcept(root, { slug: 'red-one', category: ['feature'], title: 'R', description: { definition: 'd' }, purpose: { reason: 'r' }, actions: {}, principle: {}, status: 'red' })
    await writeConcept(root, { slug: 'green-one', category: ['feature'], title: 'G', description: { definition: 'd' }, purpose: { reason: 'r' }, actions: {}, principle: {}, status: 'green' })
    const r = await auditIntegrity(root, [])
    expect(r.unapproved).toEqual(['red-one'])
    expect(r.ok).toBe(true) // red는 정합성을 막지 않음(경고만)
  })
  it('스테이징 파일이 참조하는 red 개념을 unapprovedRefs로 보고한다', async () => {
    await writeConcept(root, { slug: 'red-one', category: ['feature'], title: 'R', description: { definition: 'd' }, purpose: { reason: 'r' }, actions: {}, principle: {}, status: 'red' })
    writeFileSync(join(root, 'src/a.ts'), '// @concept:red-one\n')
    const r = await auditIntegrity(root, ['src/a.ts'])
    expect(r.unapprovedRefs).toEqual(['red-one'])
  })
  it('pending 개념은 unapproved가 아니라 pending으로 보고한다', async () => {
    await writeConcept(root, { slug: 'pend-one', category: ['term'], title: 'P', description: { definition: 'd' }, purpose: { reason: 'r' }, actions: {}, principle: {}, status: 'pending' })
    const r = await auditIntegrity(root, [])
    expect(r.unapproved).not.toContain('pend-one')
    expect(r.pending).toContain('pend-one')
  })
})
