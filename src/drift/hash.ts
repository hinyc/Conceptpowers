import { createHash } from 'node:crypto'
import type { Concept } from '../schema/concept.js'

// 코드가 따라야 할 "계약" 필드만 해시한다. 표현/메타 필드(title, eyebrow, status,
// analogy, example 등)는 제외해 사소한 편집을 drift로 오인하지 않는다.
export function contractHash(c: Concept): string {
  const contract = {
    definition: c.description.definition,
    components: c.description.components,
    allow: c.actions.allow,
    restrict: c.actions.restrict,
    interaction: c.actions.interaction,
    immutableRules: c.principle.immutableRules,
    lifecycle: c.principle.lifecycle,
    reason: c.purpose.reason,
  }
  return createHash('sha256').update(JSON.stringify(contract)).digest('hex').slice(0, 12)
}
