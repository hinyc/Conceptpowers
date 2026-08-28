// @concept:drift-reconcile
import { createHash } from 'node:crypto';
import type { Concept } from '../schema/concept.js';

// 지문 계산 규칙의 판(version). 계약에 넣는 항목이 바뀌면 판을 올린다 —
// 판이 다른 지문끼리는 견주지 않고(가짜 어긋남 방지), 다음 결산 때 현재 판으로 재기준된다.
// 2판: 상호작용(interaction)을 계약에서 제외 — 역할 경계 서술이라 개념의 독립 편집을 막지 않는다.
// 3판: 관리 대상(state.managed)과 작동 원리(operationalPrinciple)를 계약에 포함 —
//      개념이 무엇을 쥐고 있고 어떤 장면으로 목적을 이루는지가 바뀌면 코드도 따라와야 한다.
export const CONTRACT_HASH_VERSION = 3;

// 코드가 따라야 할 "계약" 필드만 해시한다. 표현/메타 필드(title, status,
// analogy, example, interaction, aliases 등)는 제외해 사소한 편집을 drift로 오인하지 않는다.
export function contractHash(c: Concept): string {
  const contract = {
    definition: c.description.definition,
    components: c.description.components,
    managed: c.state.managed,
    allow: c.actions.allow,
    restrict: c.actions.restrict,
    immutableRules: c.principle.immutableRules,
    operationalPrinciple: c.principle.operationalPrinciple,
    lifecycle: c.principle.lifecycle,
    reason: c.purpose.reason,
  };
  const digest = createHash('sha256').update(JSON.stringify(contract)).digest('hex').slice(0, 12);
  return `${CONTRACT_HASH_VERSION}:${digest}`;
}

// 지문 문자열에서 판을 읽는다. 접두가 없는 옛 지문은 1판이다.
export function hashVersion(hash: string): number {
  const m = /^(\d+):/.exec(hash);
  return m ? Number(m[1]) : 1;
}
