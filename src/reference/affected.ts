// @concept:reference-sync
// src/reference/affected.ts
// 바뀐 참고자료 → 그것을 근거로 삼은 개념(영향 개념). 열쇠는 개념의 근거 목록에 적힌 참고자료
// 좌표와만 맞춘다 — 근거는 여기서 "찾는" 데만 쓰이고, 코드 판정에는 쓰이지 않는다.
import { basename } from 'node:path/posix';
import { normalizeRel } from '../drift/safe.js';
import type { Concept, ConceptStatus } from '../schema/concept.js';

export interface AffectedConcept {
  slug: string;
  status: ConceptStatus;
  /** 맞아떨어진 근거 경로(적힌 그대로, 중복 없이) */
  sourcePaths: string[];
}

/** 근거 경로와 열쇠를 같은 표기로 모으는 함수 — 기본은 상대 경로 정리, diff는 정규 표기(canonical.ts)를 넘긴다. */
export type PathCanon = (p: string) => string;

// 기본 정리 — 끝 슬래시까지 떼어 matches(파일 이름 비교)와 citedMatcher(뒷부분 조회)가 늘 같은 답을 내게 한다.
const relCanon: PathCanon = (p) => normalizeRel(p).replace(/\/+$/, '');

const referencePaths = (concept: Concept): string[] =>
  concept.sources.filter((s) => s.kind === 'reference' && s.path !== '').map((s) => s.path);

// 이미 같은 표기로 모인 두 경로를 견준다. 근거는 전체 경로일 수도, 파일 이름만일 수도, 뒷부분 경로일 수도 있다.
// 이름 일부만 겹치는 것은 맞지 않는다(경계는 '/').
function matches(p: string, k: string): boolean {
  if (p === '' || p === '.') return false;
  return k === p || basename(k) === p || k.endsWith(`/${p}`);
}

export function sourceMatchesKey(
  sourcePath: string,
  key: string,
  canon: PathCanon = relCanon
): boolean {
  return matches(canon(sourcePath), canon(key));
}

/**
 * 어떤 개념이든 이 열쇠를 근거로 삼는지 빠르게 답하는 함수를 만든다 — 새 자료 수천 개를 견줄 때
 * 열쇠마다 모든 근거를 다시 훑지 않도록 근거를 한 번만 모아 둔다. 판정 규칙은 matches와 같다:
 * 열쇠 전체이거나, 열쇠의 '/' 경계 뒤 뒷부분(파일 이름 포함)이 근거와 같으면 맞다.
 */
export function citedMatcher(
  concepts: readonly Concept[],
  canon: PathCanon = relCanon
): (key: string) => boolean {
  const cited = new Set(
    concepts
      .flatMap(referencePaths)
      .map(canon)
      .filter((p) => p !== '' && p !== '.')
  );
  return (key) => {
    const k = canon(key);
    if (cited.has(k)) return true;
    for (let i = k.indexOf('/'); i >= 0; i = k.indexOf('/', i + 1)) {
      if (cited.has(k.slice(i + 1))) return true;
    }
    return false;
  };
}

function matchedSources(
  concept: Concept,
  canonKeys: readonly string[],
  canon: PathCanon
): string[] {
  const paths = referencePaths(concept).filter((path) => {
    const p = canon(path);
    return canonKeys.some((k) => matches(p, k));
  });
  return [...new Set(paths)];
}

export function findAffectedConcepts(
  concepts: readonly Concept[],
  keys: readonly string[],
  canon: PathCanon = relCanon
): AffectedConcept[] {
  if (keys.length === 0) return [];
  const canonKeys = keys.map(canon);
  return concepts
    .map((c) => ({
      slug: c.slug,
      status: c.status,
      sourcePaths: matchedSources(c, canonKeys, canon),
    }))
    .filter((a) => a.sourcePaths.length > 0)
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}
