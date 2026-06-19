import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeDrift } from '../../src/drift/detect.js'
import { writeConcept, readConcept } from '../../src/store/conceptStore.js'
import { writeFeature } from '../../src/store/featureStore.js'
import { writeLock } from '../../src/drift/lock.js'
import { contractHash } from '../../src/drift/hash.js'
import { appendHistory } from '../../src/drift/history.js'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })

const concept = (over: Record<string, unknown> = {}) => ({
  slug: 'auth-token', category: ['behavior'], title: 'A',
  description: { definition: 'v1' }, purpose: { reason: 'r' }, actions: {}, principle: {}, ...over,
})

describe('computeDrift', () => {
  it('lock에 없는 개념은 drift가 아니다', async () => {
    await writeConcept(root, concept())
    expect(await computeDrift(root)).toEqual([])
  })
  it('lock 해시와 현재 해시가 같으면 drift가 아니다', async () => {
    await writeConcept(root, concept())
    const c = await readConcept(root, 'auth-token')
    await writeLock(root, { 'auth-token': { hash: contractHash(c!), at: 't' } })
    expect(await computeDrift(root)).toEqual([])
  })
  it('개념이 바뀌면 drift로 보고하고 feature codePaths를 relatedPaths로 모은다', async () => {
    await writeConcept(root, concept())
    const c1 = await readConcept(root, 'auth-token')
    await writeLock(root, { 'auth-token': { hash: contractHash(c1!), at: 't' } })
    await writeFeature(root, { slug: 'login', title: 'Login', concepts: ['auth-token'], codePaths: ['src/login.ts'] })
    await appendHistory(root, { slug: 'auth-token', hash: 'new', reason: '만료 단축', at: 't2' })
    await writeConcept(root, concept({ description: { definition: 'v2-변경됨' } }))
    const drift = await computeDrift(root)
    expect(drift).toHaveLength(1)
    expect(drift[0].slug).toBe('auth-token')
    expect(drift[0].reason).toBe('만료 단축')
    expect(drift[0].relatedPaths).toContain('src/login.ts')
  })
})
