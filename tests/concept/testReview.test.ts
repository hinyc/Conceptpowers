// @concept:concept-driven-tests
// tests/concept/testReview.test.ts
// 테스트 검토 기록(test-review)의 저장과 신선도 판정을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - concept-driven-tests 불변 "개념이 바뀌면 그 개념에 딸린 검사를 반드시 다시 본다 — 검사를 함께
//    고쳤거나, 고칠 필요가 없다는 사유를 기록으로 남겼거나, 둘 중 하나여야 넘어간다"
//    → recordTestReview 후 freshTestReview가 true
//  - concept-driven-tests 불변 "딸린 검사가 아예 없더라도 조용히 넘어가지 않는다 — 검사가 없다는
//    사실을 기록으로 명시한다" → result='no-tests'도 정당한 기록으로 인정된다
//  - concept-driven-tests 불변 "검토 기록은 그 개념의 지문에 묶인다 — 개념을 다시 고치면 지난
//    기록은 효력을 잃는다" → 개념 계약이 바뀌면 기록이 실효(해시 불일치)
//  - 저장 세부(기록 없는 root면 빈 객체, 다른 slug 기록 보존, note 상한)는 개념 규칙이 아니라
//    기록 로그가 훼손되지 않게 하는 구현 세부다(attest와 같은 태도).
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readTestReviewLog,
  recordTestReview,
  freshTestReview,
} from '../../src/concept/testReview.js';
import { parseConcept } from '../../src/schema/concept.js';

function makeConcept(rules: string[], slug = 'review-target') {
  return parseConcept({
    slug,
    category: ['behavior'],
    title: 'T',
    description: { definition: '정의' },
    purpose: { reason: '이유' },
    actions: {},
    principle: { immutableRules: rules },
  });
}

describe('testReview', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-treview-'));
  });

  it('기록 없는 root에서 readTestReviewLog는 빈 객체', async () => {
    expect(await readTestReviewLog(root)).toEqual({});
  });

  it('검사를 고쳤다는 기록 뒤 freshTestReview가 true [규칙: 고쳤거나 사유를 남겼거나]', async () => {
    const c = makeConcept(['결제 완료 후 금액 변경 불가']);
    const entry = await recordTestReview(root, c, 'updated', {
      tests: ['tests/pay.test.ts'],
      note: '금액 불변 시나리오 갱신',
    });
    expect(entry.result).toBe('updated');
    expect(entry.tests).toEqual(['tests/pay.test.ts']);
    expect(freshTestReview(await readTestReviewLog(root), c)).toBe(true);
  });

  it('고칠 필요 없음(no-impact) 기록도 통과 근거로 인정된다 [규칙: 사유를 남겼으면 넘어간다]', async () => {
    const c = makeConcept(['결제 완료 후 금액 변경 불가']);
    await recordTestReview(root, c, 'no-impact', { note: '문구만 다듬어 검사 영향 없음' });
    expect(freshTestReview(await readTestReviewLog(root), c)).toBe(true);
  });

  it('딸린 검사가 없다(no-tests)는 사실도 기록으로 남긴다 [규칙: 검사가 없어도 조용히 넘어가지 않는다]', async () => {
    const c = makeConcept(['결제 완료 후 금액 변경 불가']);
    const entry = await recordTestReview(root, c, 'no-tests', { note: '아직 검사가 없다' });
    expect(entry.result).toBe('no-tests');
    expect(freshTestReview(await readTestReviewLog(root), c)).toBe(true);
  });

  it('개념 계약이 바뀌면 기록이 실효된다 [규칙: 기록은 개념 지문에 묶인다]', async () => {
    const c = makeConcept(['결제 완료 후 금액 변경 불가']);
    await recordTestReview(root, c, 'updated', { tests: ['tests/pay.test.ts'] });
    const changed = makeConcept(['환불은 7일 이내에만 허용된다']);
    expect(freshTestReview(await readTestReviewLog(root), changed)).toBe(false);
  });

  it('다른 slug의 기록은 보존한다', async () => {
    const a = makeConcept(['규칙 A'], 'concept-a');
    const b = makeConcept(['규칙 B'], 'concept-b');
    await recordTestReview(root, a, 'updated', { tests: ['tests/a.test.ts'] });
    await recordTestReview(root, b, 'no-impact');
    const log = await readTestReviewLog(root);
    expect(Object.keys(log).sort()).toEqual(['concept-a', 'concept-b']);
  });

  it('note가 상한을 넘으면 기록을 거부하고 기존 로그를 건드리지 않는다', async () => {
    const c = makeConcept(['규칙']);
    await recordTestReview(root, c, 'updated', { tests: ['tests/a.test.ts'] });
    await expect(
      recordTestReview(root, c, 'updated', { note: 'x'.repeat(1001) })
    ).rejects.toThrow();
    const log = await readTestReviewLog(root);
    expect(log['review-target'].tests).toEqual(['tests/a.test.ts']);
  });
});
