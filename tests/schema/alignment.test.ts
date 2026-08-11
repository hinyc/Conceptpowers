// @concept:drift-reconcile
import { describe, it, expect } from 'vitest';
import { AlignmentLock, History, HistoryEntry, AttestEntry } from '../../src/schema/alignment.js';

describe('alignment schemas', () => {
  it('AlignmentLock은 slug→{hash,at} 레코드를 파싱한다', () => {
    const v = AlignmentLock.parse({
      'auth-token': { hash: 'a1b2', at: '2026-06-19T00:00:00.000Z' },
    });
    expect(v['auth-token'].hash).toBe('a1b2');
  });
  it('HistoryEntry는 prevHash/reason/ignored에 기본값을 채운다', () => {
    const e = HistoryEntry.parse({
      slug: 'auth-token',
      hash: 'a1b2',
      at: '2026-06-19T00:00:00.000Z',
    });
    expect(e.prevHash).toBe('');
    expect(e.reason).toBe('');
    expect(e.ignored).toBe(false);
  });
  it('History는 엔트리 배열을 파싱한다', () => {
    const h = History.parse([{ slug: 's', hash: 'h', at: 't' }]);
    expect(h).toHaveLength(1);
  });
  it('AttestEntry: compared/note를 기록·파싱한다', () => {
    const entry = AttestEntry.parse({
      hash: 'h1',
      result: 'pass',
      at: '2026-08-11T00:00:00.000Z',
      compared: ['other-a', 'other-b'],
      note: '규칙 충돌 없음',
    });
    expect(entry.compared).toEqual(['other-a', 'other-b']);
    expect(entry.note).toBe('규칙 충돌 없음');
  });
  it('AttestEntry: compared/note 없는 기존 로그도 파싱된다 (하위 호환)', () => {
    const entry = AttestEntry.parse({ hash: 'h1', result: 'pass', at: '2026-08-11T00:00:00.000Z' });
    expect(entry.compared).toBeUndefined();
    expect(entry.note).toBeUndefined();
  });
});
