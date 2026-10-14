// @concept:concept-code-mapping
// src/audit/unlinked.ts
// 연결된 코드가 하나도 없는 확정(green) 개념을 찾는다 — 어긋남 검사는 연결 코드가 없는 개념이면
// 문서만 고쳐도 따라올 코드를 묻지 않으므로, 감사가 이 빈 곳을 격차로 알린다.
// 연결 판정은 어긋남 검사와 같은 잣대(표식 ∪ 기능 명세 codePaths, 지금 존재하는 경로만)를 쓰되,
// 표식은 보관본이 아니라 지금 파일에서 다시 읽는다(낡은 보관본을 최신으로 단정하지 않는다).
// 알리기만 한다 — 개념을 낮추거나 감사 실패로 세지 않는다(정말 코드가 필요 없는지는 사람이 가린다).
import { buildMapping } from '../mapping/scan.js';
import { collectRelatedPaths } from '../drift/detect.js';
import { pruneMissingPaths } from '../drift/follow.js';
import type { Concept } from '../schema/concept.js';
import type { Feature } from '../schema/feature.js';

export async function findUnlinkedConcepts(
  root: string,
  concepts: Concept[],
  features: Feature[],
  codeFiles: string[],
  ignoreGlobs: string[]
): Promise<string[]> {
  const green = concepts.filter((c) => c.status === 'green');
  if (green.length === 0) return [];
  // 표식만 있고 코드가 없는 파일은 연결로 세지 않는다 — 어긋남 검사의 따라옴 잣대와 같다.
  const mapping = await buildMapping(root, codeFiles, ignoreGlobs, { requireCode: true });
  const related = green.map((c) => ({
    slug: c.slug,
    paths: collectRelatedPaths(c.slug, features, mapping),
  }));
  const alive = new Set(
    await pruneMissingPaths(root, [...new Set(related.flatMap((r) => r.paths))])
  );
  return related.filter((r) => !r.paths.some((p) => alive.has(p))).map((r) => r.slug);
}
