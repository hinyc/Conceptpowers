// @concept:drift-reconcile @concept:contract-hash @concept:settled-status @concept:atomic-baseline-write
// 변경 이력(history) 기록을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - drift-reconcile 불변 "무시하고 넘어간 개념은 예외 없이 무시했다는 기록을 남긴다"
//    → append가 같은 slug의 직전 hash를 prevHash로 이어, 기록이 끊기지 않게 한다
//  - contract-hash 허용 "지문을 마지막으로 맞춰둔 지문과 견주어 어긋남을 판정하는 것"
//    → noteChange는 개념의 현재 계약 해시로 이유를 기록한다 / 없는 개념이면 throw
//  - atomic-baseline-write 구성요소 "대상: … 변경 이력 …" → 기록이 없으면 빈 배열(깨진 값 대신 안전한 기본값)
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readHistory, appendHistory } from '../../src/drift/history.js';
import { noteChange } from '../../src/drift/note.js';
import { writeConcept } from '../../src/store/conceptStore.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
});

describe('history', () => {
  it('없으면 빈 배열', async () => {
    expect(await readHistory(root)).toEqual([]);
  });
  it('append는 같은 slug의 직전 hash를 prevHash로 연결한다', async () => {
    await appendHistory(root, { slug: 'auth-token', hash: 'h1', reason: '최초', at: 't1' });
    const e2 = await appendHistory(root, {
      slug: 'auth-token',
      hash: 'h2',
      reason: '변경',
      at: 't2',
    });
    expect(e2.prevHash).toBe('h1');
    expect(await readHistory(root)).toHaveLength(2);
  });
  it('noteChange는 개념의 현재 계약 해시로 이유를 기록한다', async () => {
    await writeConcept(root, {
      slug: 'auth-token',
      category: ['behavior'],
      title: 'A',
      description: { definition: 'd' },
      purpose: { reason: 'r' },
      actions: {},
      principle: {},
    });
    const e = await noteChange(root, 'auth-token', '만료 30분으로', 't1');
    expect(e.slug).toBe('auth-token');
    expect(e.reason).toBe('만료 30분으로');
    expect(e.hash).toMatch(/^\d+:[0-9a-f]{12}$/); // 판 접두 + 12자리 지문
  });
  it('noteChange는 없는 개념이면 throw', async () => {
    await expect(noteChange(root, 'ghost', 'x', 't')).rejects.toThrow('ghost');
  });
});
