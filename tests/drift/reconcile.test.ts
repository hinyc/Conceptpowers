import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reconcileAfterCommit } from '../../src/drift/reconcile.js'
import { writeConcept, readConcept } from '../../src/store/conceptStore.js'
import { writeFeature } from '../../src/store/featureStore.js'
import { writeLock, readLock } from '../../src/drift/lock.js'
import { readHistory } from '../../src/drift/history.js'
import { contractHash } from '../../src/drift/hash.js'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })

const concept = (over: Record<string, unknown> = {}) => ({
  slug: 'auth-token', category: ['behavior'], title: 'A',
  description: { definition: 'v1' }, purpose: { reason: 'r' }, actions: {}, principle: {}, ...over,
})

// v1을 lock에 등록한 뒤 v2로 바꿔 drift를 만든다.
async function makeDrift() {
  await writeConcept(root, concept())
  const c1 = await readConcept(root, 'auth-token')
  await writeLock(root, { 'auth-token': { hash: contractHash(c1!), at: 't' } })
  await writeFeature(root, { slug: 'login', title: 'L', concepts: ['auth-token'], codePaths: ['src/login.ts'] })
  await writeConcept(root, concept({ description: { definition: 'v2' } }))
}

describe('reconcileAfterCommit', () => {
  it('관련 코드가 커밋에 포함되면 aligned로 분류하고 lock을 현재 해시로 갱신', async () => {
    await makeDrift()
    const c2 = await readConcept(root, 'auth-token')
    const r = await reconcileAfterCommit(root, ['src/login.ts'], 't2')
    expect(r.aligned).toContain('auth-token')
    expect(r.ignored).toEqual([])
    expect((await readLock(root))['auth-token'].hash).toBe(contractHash(c2!))
  })
  it('관련 코드가 빠지면 ignored로 분류하고 history에 ignored 기록 + lock 갱신', async () => {
    await makeDrift()
    const r = await reconcileAfterCommit(root, ['README.md'], 't2')
    expect(r.ignored).toContain('auth-token')
    const h = await readHistory(root)
    expect(h.some((e) => e.slug === 'auth-token' && e.ignored)).toBe(true)
  })
  it('lock에 없던 신규 개념은 현재 해시로 등록한다', async () => {
    await writeConcept(root, concept())
    const c = await readConcept(root, 'auth-token')
    const r = await reconcileAfterCommit(root, [], 't1')
    expect(r.aligned).toEqual([])
    expect(r.ignored).toEqual([])
    expect((await readLock(root))['auth-token'].hash).toBe(contractHash(c!))
  })
})
