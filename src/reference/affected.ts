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

// 근거는 저장소 상대 경로일 수도, 등록 폴더 안 파일 이름만일 수도, 뒷부분 경로일 수도 있다.
// 이름 일부만 겹치는 것은 맞지 않는다(경계는 '/').
export function sourceMatchesKey(sourcePath: string, key: string): boolean {
  const p = normalizeRel(sourcePath);
  const k = normalizeRel(key);
  if (p === '') return false;
  return k === p || basename(k) === p || k.endsWith(`/${p}`);
}

function matchedSources(concept: Concept, keys: readonly string[]): string[] {
  const paths = concept.sources
    .filter((s) => s.kind === 'reference' && s.path !== '')
    .filter((s) => keys.some((k) => sourceMatchesKey(s.path, k)))
    .map((s) => s.path);
  return [...new Set(paths)];
}

export function findAffectedConcepts(
  concepts: readonly Concept[],
  keys: readonly string[]
): AffectedConcept[] {
  if (keys.length === 0) return [];
  return concepts
    .map((c) => ({ slug: c.slug, status: c.status, sourcePaths: matchedSources(c, keys) }))
    .filter((a) => a.sourcePaths.length > 0)
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}
