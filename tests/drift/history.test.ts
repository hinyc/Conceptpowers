import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readHistory, appendHistory } from '../../src/drift/history.js'
import { noteChange } from '../../src/drift/note.js'
import { writeConcept } from '../../src/store/conceptStore.js'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })

describe('history', () => {
  it('없으면 빈 배열', async () => {
    expect(await readHistory(root)).toEqual([])
  })
  it('append는 같은 slug의 직전 hash를 prevHash로 연결한다', async () => {
    await appendHistory(root, { slug: 'auth-token', hash: 'h1', reason: '최초', at: 't1' })
    const e2 = await appendHistory(root, { slug: 'auth-token', hash: 'h2', reason: '변경', at: 't2' })
    expect(e2.prevHash).toBe('h1')
    expect(await readHistory(root)).toHaveLength(2)
  })
  it('noteChange는 개념의 현재 계약 해시로 이유를 기록한다', async () => {
    await writeConcept(root, {
      slug: 'auth-token', category: ['behavior'], title: 'A',
      description: { definition: 'd' }, purpose: { reason: 'r' }, actions: {}, principle: {},
    })
    const e = await noteChange(root, 'auth-token', '만료 30분으로', 't1')
    expect(e.slug).toBe('auth-token')
    expect(e.reason).toBe('만료 30분으로')
    expect(e.hash).toHaveLength(12)
  })
  it('noteChange는 없는 개념이면 throw', async () => {
    await expect(noteChange(root, 'ghost', 'x', 't')).rejects.toThrow('ghost')
  })
})
