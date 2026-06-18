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
})
