// @concept:drift-reconcile
// tests/drift/noCode.test.ts
// 코드무관 기록(no-code)의 저장과 신선도 판정을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - drift-reconcile 허용 "코드 변경이 필요 없다는 판단을 지문에 묶어 기록하는 것"
//    → recordNoCode 후 freshNoCode가 true
//  - drift-reconcile 불변 "코드 변경이 필요 없다는 기록은 사유 없이 남길 수 없고, 개념이 다시
//    바뀌면 효력을 잃는다" → 빈 사유는 거부(throw), 계약이 바뀌면 기록 실효(해시 불일치)
//  - 저장 세부(기록 없는 root면 빈 객체, 다른 slug 기록 보존, 사라진 개념 정리)는 검토
//    기록(test-review)·증빙(attest)과 같은 태도의 구현 세부다.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readNoCodeLog, recordNoCode, freshNoCode, pruneNoCodeLog } from '../../src/drift/noCode.js';
import { contractHash } from '../../src/drift/hash.js';
import { parseConcept } from '../../src/schema/concept.js';

function makeConcept(definition: string, slug = 'no-code-target') {
  return parseConcept({
    slug,
    category: ['behavior'],
    title: 'T',
    description: { definition },
    purpose: { reason: '이유' },
    actions: {},
    principle: { immutableRules: ['결제 완료 후 금액 변경 불가'] },
  });
}

describe('noCode', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-nocode-'));
  });

  it('기록 없는 root에서 readNoCodeLog는 빈 객체', async () => {
    expect(await readNoCodeLog(root)).toEqual({});
  });

  it('사유와 함께 기록하면 freshNoCode가 true [규칙: 판단을 지문에 묶어 기록]', async () => {
    const c = makeConcept('정의 v1');
    const entry = await recordNoCode(root, c, '용어 정리만 반영한 개념 수정 — 코드 영향 없음');
    expect(entry.note).toContain('코드 영향 없음');
    const log = await readNoCodeLog(root);
    expect(freshNoCode(log, c.slug, contractHash(c))).toBe(true);
  });

  it('빈 사유로는 기록할 수 없다 [규칙: 사유 없이 남길 수 없다]', async () => {
    const c = makeConcept('정의 v1');
    await expect(recordNoCode(root, c, '')).rejects.toThrow();
    expect(await readNoCodeLog(root)).toEqual({});
  });

  it('개념 계약이 바뀌면 기록이 실효된다 [규칙: 개념이 다시 바뀌면 효력을 잃는다]', async () => {
    const v1 = makeConcept('정의 v1');
    await recordNoCode(root, v1, '코드 영향 없는 수정');
    const v2 = makeConcept('정의 v2');
    const log = await readNoCodeLog(root);
    expect(freshNoCode(log, v2.slug, contractHash(v2))).toBe(false);
  });

  it('다른 slug의 기록은 보존한 채 덮어쓴다', async () => {
    const a = makeConcept('정의', 'slug-a');
    const b = makeConcept('정의', 'slug-b');
    await recordNoCode(root, a, '사유 A');
    await recordNoCode(root, b, '사유 B');
    const log = await readNoCodeLog(root);
    expect(log['slug-a'].note).toBe('사유 A');
    expect(log['slug-b'].note).toBe('사유 B');
  });

  it('사라진 개념의 기록을 정리하고 살아 있는 개념은 남긴다', async () => {
    const a = makeConcept('정의', 'slug-a');
    const b = makeConcept('정의', 'slug-b');
    await recordNoCode(root, a, '사유 A');
    await recordNoCode(root, b, '사유 B');
    const dead = await pruneNoCodeLog(root, new Set(['slug-a']));
    expect(dead).toEqual(['slug-b']);
    const log = await readNoCodeLog(root);
    expect(Object.keys(log)).toEqual(['slug-a']);
  });
});
