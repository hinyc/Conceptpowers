import { describe, it, expect } from 'vitest'
import { AlignmentLock, History, HistoryEntry } from '../../src/schema/alignment.js'

describe('alignment schemas', () => {
  it('AlignmentLock은 slug→{hash,at} 레코드를 파싱한다', () => {
    const v = AlignmentLock.parse({ 'auth-token': { hash: 'a1b2', at: '2026-06-19T00:00:00.000Z' } })
    expect(v['auth-token'].hash).toBe('a1b2')
  })
  it('HistoryEntry는 prevHash/reason/ignored에 기본값을 채운다', () => {
    const e = HistoryEntry.parse({ slug: 'auth-token', hash: 'a1b2', at: '2026-06-19T00:00:00.000Z' })
    expect(e.prevHash).toBe('')
    expect(e.reason).toBe('')
    expect(e.ignored).toBe(false)
  })
  it('History는 엔트리 배열을 파싱한다', () => {
    const h = History.parse([{ slug: 's', hash: 'h', at: 't' }])
    expect(h).toHaveLength(1)
  })
})
