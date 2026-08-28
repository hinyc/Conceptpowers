// @concept:settled-status
// 품질 최소치(checkConceptQuality)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - settled-status 불변 "초록이 되려면 두 가지가 갖춰져야 한다 — 관리하는 대상·작동 원리·지킬 수
//    있는 규칙이 실제로 적혀 있을 것(품질 최소치), …"
//    → 규칙 0개면 결격 / 10자 이상 규칙이 하나라도 있으면 통과 / trim 후 10자 미만이면 결격
//    → 관리 대상이 비면 결격 / 작동 원리가 비거나 너무 짧으면 결격
//    → term 단독 카테고리는 규칙·관리 대상·작동 원리 대신 example을 요구
//    → term+behavior 복합은 규칙을 요구
//  - "입력 개념 객체를 변경하지 않는다"는 개념 규칙이 아니라 이 함수가 순수 함수라는 계약이다.
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
    state: { managed: ['검사 결과'] },
    actions: { allow: [], restrict: [] },
    principle: { immutableRules: [], operationalPrinciple: '개념을 넣으면 결격 목록이 나온다' },
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
        principle: {
          immutableRules: ['결제 완료 후 가격 칸은 바꾸지 못한다'],
          operationalPrinciple: '결제를 마치면 가격이 잠긴다',
        },
      })
    );
    expect(r).toEqual({ ok: true, deficiencies: [], warnings: [] });
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

  it('관리 대상이 비면 결격 — 개념은 자기가 관리하는 대상을 가진다', () => {
    const r = checkConceptQuality(
      makeConcept({
        state: { managed: [] },
        principle: {
          immutableRules: ['결제 완료 후 가격 칸은 바꾸지 못한다'],
          operationalPrinciple: '결제를 마치면 가격이 잠긴다',
        },
      })
    );
    expect(r.ok).toBe(false);
    expect(r.deficiencies.join(' ')).toContain('state.managed');
  });

  it('빈 문자열만 든 관리 대상은 적힌 것으로 치지 않는다', () => {
    const r = checkConceptQuality(
      makeConcept({
        state: { managed: ['  '] },
        principle: {
          immutableRules: ['결제 완료 후 가격 칸은 바꾸지 못한다'],
          operationalPrinciple: '결제를 마치면 가격이 잠긴다',
        },
      })
    );
    expect(r.ok).toBe(false);
    expect(r.deficiencies.join(' ')).toContain('state.managed');
  });

  it('작동 원리가 비면 결격 — 전형적인 한 장면이 있어야 한다', () => {
    const r = checkConceptQuality(
      makeConcept({
        principle: { immutableRules: ['결제 완료 후 가격 칸은 바꾸지 못한다'] },
      })
    );
    expect(r.ok).toBe(false);
    expect(r.deficiencies.join(' ')).toContain('operationalPrinciple');
  });

  it('작동 원리가 10자 미만이면 결격', () => {
    const r = checkConceptQuality(
      makeConcept({
        principle: {
          immutableRules: ['결제 완료 후 가격 칸은 바꾸지 못한다'],
          operationalPrinciple: '   짧다   ',
        },
      })
    );
    expect(r.ok).toBe(false);
    expect(r.deficiencies.join(' ')).toContain('operationalPrinciple');
  });

  it('term 단독 카테고리는 규칙·관리 대상·작동 원리 대신 example을 요구', () => {
    const noExample = checkConceptQuality(
      makeConcept({ category: ['term'], state: { managed: [] }, principle: {} })
    );
    expect(noExample.ok).toBe(false);
    const withExample = checkConceptQuality(
      makeConcept({
        category: ['term'],
        state: { managed: [] },
        principle: {},
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
