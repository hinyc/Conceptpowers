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
})
