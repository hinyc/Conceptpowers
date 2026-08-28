// @concept:settled-status @concept:concept-scope
// src/concept/quality.ts
// green 승격의 결정론적 최소치. 규칙의 "의미적" 품질(위반 판별 가능한 문장인가)은
// define-concept 스킬(LLM 루브릭)이 담당하고, 여기서는 기계 검증 가능한 결격만 거른다.
import type { Concept } from '../schema/concept.js';
import { findImplementationLeaks, describeLeak } from './implementationLeak.js';
import { findConceptReferences, describeConceptReference } from './conceptReference.js';

export interface QualityReport {
  ok: boolean;
  deficiencies: string[];
  // 결격은 아니지만 사람이 한 번 봐야 하는 것들 — ok 판정에는 넣지 않는다.
  warnings: string[];
}

const MIN_RULE_LENGTH = 10;

// 용어 단독 개념의 계약은 정의+예시다 — 관리 대상·작동 원리·규칙 대신 example만 요구한다.
function checkTermConcept(c: Concept): string[] {
  return c.description.example.trim() === ''
    ? [
        "term concept requires a non-empty description.example (a term's contract is definition + example)",
      ]
    : [];
}

// 용어가 아닌 개념은 개념의 네 요소(목적·관리 대상·행동·작동 원리)를 모두 갖춰야 한다.
function checkFullConcept(c: Concept, rules: readonly string[]): string[] {
  const managed = c.state.managed.filter((m) => m.trim() !== '');
  const principle = c.principle.operationalPrinciple.trim();
  return [
    ...(managed.length === 0
      ? [
          'no managed state: state.managed must name at least 1 thing this concept owns and its actions change',
        ]
      : []),
    ...(rules.length === 0
      ? [
          'no enforceable rule: actions.allow / actions.restrict / principle.immutableRules must contain at least 1 item in total',
        ]
      : []),
    ...(principle.length < MIN_RULE_LENGTH
      ? [
          `no operational principle: principle.operationalPrinciple must describe one archetypal scenario (>= ${MIN_RULE_LENGTH} chars after trim)`,
        ]
      : []),
  ];
}

export function checkConceptQuality(c: Concept, knownSlugs: readonly string[] = []): QualityReport {
  const rules = [...c.actions.allow, ...c.actions.restrict, ...c.principle.immutableRules];
  const termOnly = c.category.length === 1 && c.category[0] === 'term';

  const deficiencies = [
    ...(termOnly ? checkTermConcept(c) : checkFullConcept(c, rules)),
    ...rules
      .filter((rule) => rule.trim().length < MIN_RULE_LENGTH)
      .map((rule) => `rule too short (< ${MIN_RULE_LENGTH} chars after trim): "${rule}"`),
    // 개념 독립성 — 규칙이 다른 개념의 이름을 불러야 판별된다면 혼자 서지 못하는 개념이다.
    ...findConceptReferences(c, knownSlugs).map(describeConceptReference),
  ];

  const warnings = findImplementationLeaks(c).map(describeLeak);

  return { ok: deficiencies.length === 0, deficiencies, warnings };
}
