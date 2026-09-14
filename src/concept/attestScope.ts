// @concept:settled-status
// src/concept/attestScope.ts
// 검사 증빙의 비교 범위. 증빙은 에이전트의 자기신고라 "무엇과 견줬는가"가 유일한 실체다 — 자기 자신과
// 견준 기록이나 일부만 견준 기록은 증빙으로 받지 않고, 그때 있는 다른 모든 개념과 견줘야 한다.
// `all`은 다른 개념 전부로 풀어 기록에는 실제 slug 목록이 남게 한다.

export const COMPARED_ALL = 'all';

export function resolveComparedScope(
  slug: string,
  requested: readonly string[],
  knownSlugs: readonly string[]
): string[] {
  const others = knownSlugs.filter((s) => s !== slug);
  // `all`과 함께 적은 항목도 똑같이 검증한다 — `all`이 잘못된 항목을 덮어 주지 않는다.
  if (requested.includes(slug)) {
    throw new Error(
      `--compared에 자기 자신(${slug})은 넣을 수 없습니다 — 정합성 검사는 다른 개념과 견주는 것입니다`
    );
  }
  const known = new Set(knownSlugs);
  const unknown = requested.filter((s) => s !== COMPARED_ALL && !known.has(s));
  if (unknown.length > 0) {
    throw new Error(`--compared has unknown concept slug(s): ${unknown.join(', ')}`);
  }
  if (requested.includes(COMPARED_ALL)) return [...others];
  const requestedSet = new Set(requested);
  const missing = others.filter((s) => !requestedSet.has(s));
  if (missing.length > 0) {
    throw new Error(
      `--compared 범위가 좁습니다 — 견주지 않은 개념: ${missing.join(', ')}. 정합성 검사는 그때 있는 다른 모든 개념과 견줍니다(--compared all 로 전부를 지정할 수 있습니다)`
    );
  }
  return [...new Set(requested)];
}
