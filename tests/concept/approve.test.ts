// tests/concept/approve.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scaffoldInit } from '../../src/init/scaffold.js'
import { writeConcept } from '../../src/store/conceptStore.js'
import { approveConcept } from '../../src/concept/approve.js'

const baseConcept = {
  slug: 'admin-role', group: 'auth', category: ['role'], title: 'Admin',
  description: { definition: 'd' }, purpose: { reason: 'r' },
  actions: {}, principle: {}, status: 'red'
}

describe('approveConcept', () => {
  let root: string
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'cp-approve-'))
    await scaffoldInit(root, {})
    await writeConcept(root, baseConcept)
  })
  it('red 개념을 green으로 승인한다', async () => {
    const c = await approveConcept(root, 'admin-role')
    expect(c.status).toBe('green')
  })
  it('이미 green인 개념은 승인을 거부한다', async () => {
    await writeConcept(root, { ...baseConcept, status: 'green' })
    await expect(approveConcept(root, 'admin-role')).rejects.toThrow(/green/i)
  })
  it('pending 개념은 승인을 거부한다(approve는 red 전용)', async () => {
    await writeConcept(root, { ...baseConcept, status: 'pending' })
    await expect(approveConcept(root, 'admin-role')).rejects.toThrow(/pending|consistency/i)
  })
  it('없는 개념은 에러를 던진다', async () => {
    await expect(approveConcept(root, 'ghost')).rejects.toThrow(/not found/i)
  })
})
