// @concept:settled-status
import { describe, it, expect } from 'vitest';
import { checkConceptQuality } from '../../src/concept/quality.js';
import { parseConcept } from '../../src/schema/concept.js';

function makeConcept(over: Record<string, unknown> = {}) {
  return parseConcept({
    slug: 'test-quality',
    category: ['behavior'],
    title: 'T',
    description: { definition: '정의' },
    purpose: { reason: '이유' },
    actions: { allow: [], restrict: [] },
    principle: { immutableRules: [] },
    ...over,
  });
}

describe('checkConceptQuality', () => {
  it('규칙 0개(allow/restrict/immutableRules 모두 빈)면 결격', () => {
    const r = checkConceptQuality(makeConcept());
    expect(r.ok).toBe(false);
    expect(r.deficiencies).toHaveLength(1);
  });

  it('10자 이상 규칙이 1개라도 있으면 통과', () => {
    const r = checkConceptQuality(
      makeConcept({
        principle: { immutableRules: ['결제 완료 후 price 필드는 변경 불가'] },
      })
    );
    expect(r).toEqual({ ok: true, deficiencies: [] });
  });

  it('규칙이 있어도 trim 후 10자 미만이면 결격', () => {
    const r = checkConceptQuality(
      makeConcept({
        actions: { allow: ['  짧다  '] },
      })
    );
    expect(r.ok).toBe(false);
    // 짧은 규칙 결격 + (유효 규칙이 그것뿐이라도 존재는 하므로) 규칙-부재 결격은 없음
    expect(r.deficiencies).toHaveLength(1);
  });

  it('term 단독 카테고리는 규칙 대신 example을 요구', () => {
    const noExample = checkConceptQuality(makeConcept({ category: ['term'] }));
    expect(noExample.ok).toBe(false);
    const withExample = checkConceptQuality(
      makeConcept({
        category: ['term'],
        description: { definition: '정의', example: '사용 예시 문장' },
      })
    );
    expect(withExample.ok).toBe(true);
  });

  it('term + behavior 복합 카테고리는 규칙을 요구(term 예외는 단독일 때만)', () => {
    const r = checkConceptQuality(
      makeConcept({
        category: ['term', 'behavior'],
        description: { definition: '정의', example: '예시' },
      })
    );
    expect(r.ok).toBe(false);
  });

  it('입력 개념 객체를 변경하지 않는다(불변)', () => {
    const c = makeConcept();
    const before = JSON.stringify(c);
    checkConceptQuality(c);
    expect(JSON.stringify(c)).toBe(before);
  });
});
