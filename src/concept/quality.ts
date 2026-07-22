// src/concept/quality.ts
// green 승격의 결정론적 최소치. 규칙의 "의미적" 품질(위반 판별 가능한 문장인가)은
// define-concept 스킬(LLM 루브릭)이 담당하고, 여기서는 기계 검증 가능한 결격만 거른다.
import type { Concept } from '../schema/concept.js'

export interface QualityReport {
  ok: boolean
  deficiencies: string[]
}

const MIN_RULE_LENGTH = 10

export function checkConceptQuality(c: Concept): QualityReport {
  const deficiencies: string[] = []
  const rules = [...c.actions.allow, ...c.actions.restrict, ...c.principle.immutableRules]
  const termOnly = c.category.length === 1 && c.category[0] === 'term'

  if (termOnly) {
    // 용어 개념의 계약은 정의+예시다. 규칙 대신 example을 요구한다.
    if (c.description.example.trim() === '') {
      deficiencies.push(
        'term concept requires a non-empty description.example (a term\'s contract is definition + example)',
      )
    }
  } else if (rules.length === 0) {
    deficiencies.push(
      'no enforceable rule: actions.allow / actions.restrict / principle.immutableRules must contain at least 1 item in total',
    )
  }

  for (const rule of rules) {
    if (rule.trim().length < MIN_RULE_LENGTH) {
      deficiencies.push(`rule too short (< ${MIN_RULE_LENGTH} chars after trim): "${rule}"`)
    }
  }

  return { ok: deficiencies.length === 0, deficiencies }
}
