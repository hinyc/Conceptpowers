// tests/concept/approve.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { approveConcept } from '../../src/concept/approve.js'
import { scaffoldInit } from '../../src/init/scaffold.js'
import { writeConcept, readConcept } from '../../src/store/conceptStore.js'

const base = {
  slug: 'admin-role', category: ['role'], title: 'Admin Role',
  description: { definition: 'd' }, purpose: { reason: 'r' }, actions: {}, principle: {}
}
let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })

describe('approveConcept', () => {
  it('manual 모드(기본)에서는 승인을 거부한다', async () => {
    await scaffoldInit(root, {})
    await writeConcept(root, base as any)
    await expect(approveConcept(root, 'admin-role')).rejects.toThrow(/approval/i)
    expect((await readConcept(root, 'admin-role'))?.status).toBe('red') // 변경 없음
  })
  it('cli 모드에서는 status를 green으로 승인한다', async () => {
    await scaffoldInit(root, { approvalMode: 'cli' })
    await writeConcept(root, base as any)
    const c = await approveConcept(root, 'admin-role')
    expect(c.status).toBe('green')
    expect((await readConcept(root, 'admin-role'))?.status).toBe('green')
  })
})
