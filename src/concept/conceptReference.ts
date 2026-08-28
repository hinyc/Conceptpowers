// @concept:concept-scope
// src/concept/conceptReference.ts
// 개념의 규칙 문장에 남은 "다른 개념의 이름"을 찾아낸다. 규칙이 다른 개념을 불러야만
// 판별되면 그 개념은 혼자 서지 못하고, 개념 사이의 맞물림이 규칙 속에 숨는다.
// 맞물림을 적는 자리는 상호작용이므로 상호작용 칸은 훑지 않는다.
import type { Concept } from '../schema/concept.js';

export interface ConceptReferenceFinding {
  /** 어느 규칙 칸에서 나왔는지 (예: actions.restrict[0]) */
  field: string;
  /** 그 칸에 적힌 다른 개념의 이름표 */
  slug: string;
}

// 정규식 특수문자를 막는다 — 이름표는 소문자·숫자·붙임표뿐이지만 입력을 믿지 않는다.
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 이름표 경계 — 앞뒤가 영문·숫자·붙임표면 더 긴 이름의 일부이므로 참조로 세지 않는다.
function slugPattern(slug: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9-])${escapeRegExp(slug)}(?![A-Za-z0-9-])`);
}

function scanText(field: string, text: string, slugs: readonly string[]): ConceptReferenceFinding[] {
  return slugs.filter((s) => slugPattern(s).test(text)).map((slug) => ({ field, slug }));
}

function scanList(
  field: string,
  items: readonly string[],
  slugs: readonly string[]
): ConceptReferenceFinding[] {
  return items.flatMap((text, i) => scanText(`${field}[${i}]`, text, slugs));
}

/**
 * 규칙 칸(관리 대상·허용·제한·불변 규칙·작동 원리)에 적힌 다른 개념의 이름을 찾는다.
 * 상호작용·설명·목적은 맞물림과 배경을 적는 자리라 훑지 않고, 자기 이름도 세지 않는다.
 */
export function findConceptReferences(
  concept: Concept,
  knownSlugs: readonly string[]
): readonly ConceptReferenceFinding[] {
  // 겹쳐 든 조각을 긴 이름이 먼저 차지하도록 길이 내림차순으로 본다.
  const others = [...knownSlugs]
    .filter((s) => s !== concept.slug)
    .sort((a, b) => b.length - a.length);
  if (others.length === 0) return [];

  return [
    ...scanList('state.managed', concept.state.managed, others),
    ...scanList('actions.allow', concept.actions.allow, others),
    ...scanList('actions.restrict', concept.actions.restrict, others),
    ...scanList('principle.immutableRules', concept.principle.immutableRules, others),
    ...scanText(
      'principle.operationalPrinciple',
      concept.principle.operationalPrinciple,
      others
    ),
  ];
}

/** 결격 문구로 옮긴다 — 옮겨 적을 자리(상호작용)를 함께 알려준다. */
export function describeConceptReference(f: ConceptReferenceFinding): string {
  return `rule depends on another concept's slug — ${f.field}: "${f.slug}" (concept independence: move the cross-concept coordination to actions.interaction and state the rule so it stands alone)`;
}
