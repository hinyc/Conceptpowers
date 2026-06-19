import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readLock, writeLock } from '../../src/drift/lock.js'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })

describe('lock', () => {
  it('없으면 빈 객체를 반환한다', async () => {
    expect(await readLock(root)).toEqual({})
  })
  it('쓰고 다시 읽으면 동일하다', async () => {
    await writeLock(root, { 'auth-token': { hash: 'a1b2', at: 't' } })
    expect(await readLock(root)).toEqual({ 'auth-token': { hash: 'a1b2', at: 't' } })
  })
})
