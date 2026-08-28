// @concept:concept-scope
// 규칙 문장에 남은 다른 개념 이름(findConceptReferences)을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - concept-scope 불변 "개념의 규칙 문장은 다른 개념의 이름 없이 그대로 판별된다 — 개념 사이의
//    맞물림은 규칙이 아니라 상호작용 자리에 적는다"
//    → 허용·제한·불변 규칙·작동 원리에 다른 개념 이름이 있으면 찾아낸다
//    → 상호작용 자리의 다른 개념 이름은 찾지 않는다 (그 자리가 맞물림을 적는 자리다)
//    → 자기 자신의 이름은 찾지 않는다 (자기 참조는 기대는 것이 아니다)
//  - concept-scope 제한 "다른 개념의 이름을 규칙 문장에 적어 그 개념에 기대는 것"
//    → 품질 최소치에서 결격으로 잡힌다
//  - "다른 이름의 일부로 겹쳐 든 조각은 찾지 않는다"는 개념 규칙이 아니라 이 판정이
//    오탐 없이 결정론적이어야 한다는 이 함수의 계약이다.
import { describe, it, expect } from 'vitest';
import { findConceptReferences } from '../../src/concept/conceptReference.js';
import { checkConceptQuality } from '../../src/concept/quality.js';
import { parseConcept } from '../../src/schema/concept.js';

const OTHERS = ['settled-status', 'governance-mode', 'scope', 'concept-scope'];

function makeConcept(over: Record<string, unknown> = {}) {
  return parseConcept({
    slug: 'concept-scope',
    category: ['behavior'],
    title: 'T',
    description: { definition: '정의' },
    purpose: { reason: '이유' },
    state: { managed: ['개념 자격 판정 결과'] },
    actions: { allow: [], restrict: [] },
    principle: { immutableRules: [], operationalPrinciple: '전형적인 장면 하나' },
    ...over,
  });
}

describe('findConceptReferences', () => {
  it('허용 행동에 적힌 다른 개념 이름을 찾아낸다', () => {
    const found = findConceptReferences(
      makeConcept({ actions: { allow: ['신호등(settled-status)을 따라 올리는 것'] } }),
      OTHERS
    );
    expect(found).toEqual([{ field: 'actions.allow[0]', slug: 'settled-status' }]);
  });

  it('제한 행동·불변 규칙·작동 원리도 함께 훑는다', () => {
    const found = findConceptReferences(
      makeConcept({
        actions: { restrict: ['governance-mode가 약할 때 건너뛰는 것'] },
        principle: {
          immutableRules: ['settled-status가 초록일 때만 판정한다'],
          operationalPrinciple: 'governance-mode를 읽어 판단한다',
        },
      }),
      OTHERS
    );
    expect(found.map((f) => f.field)).toEqual([
      'actions.restrict[0]',
      'principle.immutableRules[0]',
      'principle.operationalPrinciple',
    ]);
  });

  it('상호작용 자리의 다른 개념 이름은 찾지 않는다 — 맞물림을 적는 자리다', () => {
    const found = findConceptReferences(
      makeConcept({
        actions: { allow: ['규칙 하나'], interaction: '신호등(settled-status)과는 시점이 다르다' },
      }),
      OTHERS
    );
    expect(found).toEqual([]);
  });

  it('자기 자신의 이름은 찾지 않는다', () => {
    const found = findConceptReferences(
      makeConcept({ actions: { allow: ['concept-scope 기준을 그대로 적용하는 것'] } }),
      OTHERS
    );
    expect(found).toEqual([]);
  });

  it('다른 이름의 일부로 겹쳐 든 조각은 찾지 않는다', () => {
    // 'scope'는 개념 이름이지만 'concept-scope' 안에 겹쳐 든 것은 참조가 아니다.
    const found = findConceptReferences(
      makeConcept({
        slug: 'other-concept',
        actions: { allow: ['concept-scope 기준을 그대로 적용하는 것'] },
      }),
      OTHERS
    );
    expect(found).toEqual([{ field: 'actions.allow[0]', slug: 'concept-scope' }]);
  });

  it('아는 개념 이름이 없으면 아무것도 찾지 않는다', () => {
    expect(
      findConceptReferences(makeConcept({ actions: { allow: ['settled-status를 본다'] } }), [])
    ).toEqual([]);
  });

  it('품질 최소치에서 결격으로 잡힌다 (경고가 아니라 결격)', () => {
    const c = makeConcept({ actions: { allow: ['settled-status를 따라 올리는 것'] } });
    const r = checkConceptQuality(c, OTHERS);
    expect(r.ok).toBe(false);
    expect(r.deficiencies.join(' ')).toContain('settled-status');
  });

  it('입력 개념 객체를 변경하지 않는다(불변)', () => {
    const c = makeConcept({ actions: { allow: ['settled-status를 본다'] } });
    const before = JSON.stringify(c);
    findConceptReferences(c, OTHERS);
    expect(JSON.stringify(c)).toBe(before);
  });
});
