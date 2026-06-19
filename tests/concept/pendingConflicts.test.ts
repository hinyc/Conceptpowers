import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scaffoldInit } from '../../src/init/scaffold.js'
import {
  readPendingConflicts, setPendingConflict, clearPendingConflict,
} from '../../src/concept/pendingConflicts.js'

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
})
