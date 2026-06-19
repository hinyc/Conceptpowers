import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scaffoldInit } from '../../src/init/scaffold.js'
import {
  readPendingConflicts, setPendingConflict, clearPendingConflict,
} from '../../src/concept/pendingConflicts.js'
import { writeConcept, setConceptStatus } from '../../src/store/conceptStore.js'

const baseConcept = {
  slug: 'test-concept', category: ['feature'], title: 'Test Concept',
  description: { definition: 'd' }, purpose: { reason: 'r' }, actions: {}, principle: {},
}

describe('pendingConflicts', () => {
  let root: string
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'cp-conf-'))
    await scaffoldInit(root, {})
  })
  it('없으면 빈 객체를 반환한다', async () => {
    expect(await readPendingConflicts(root)).toEqual({})
  })
  it('사유를 기록하고 읽는다(불변)', async () => {
    await setPendingConflict(root, 'a', 'conflicts with b')
    expect(await readPendingConflicts(root)).toEqual({ a: 'conflicts with b' })
  })
  it('해소하면 항목이 사라진다', async () => {
    await setPendingConflict(root, 'a', 'x')
    await clearPendingConflict(root, 'a')
    expect(await readPendingConflicts(root)).toEqual({})
  })
  it('setConceptStatus → green 전환 시 충돌 기록이 자동 정리된다', async () => {
    await writeConcept(root, { ...baseConcept, status: 'pending' } as any)
    await setPendingConflict(root, 'test-concept', 'conflicts with existing-concept')
    expect(await readPendingConflicts(root)).toEqual({ 'test-concept': 'conflicts with existing-concept' })
    await setConceptStatus(root, 'test-concept', 'green')
    expect(await readPendingConflicts(root)).toEqual({})
  })
})
