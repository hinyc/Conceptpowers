// @concept:concept-code-mapping
// src/audit/gaps.ts
// 개념 없는 코드(@concept 태그가 없는 거버넌스 대상 코드 파일) 탐지.
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { matchesAny } from '../util/glob.js';
import { leadingCommentBlock } from '../mapping/leadingComment.js';
import { conceptTagSlugs, NO_CONCEPT_TAG } from '../mapping/scan.js';

/** 파일 내용을 읽는 함수 — 없거나 읽을 수 없으면 null. 넘기지 않으면 디스크에서 읽는다. */
export type ReadContent = (rel: string) => Promise<string | null>;

/** 디스크 판독기(루트 기준 상대 경로) — 판독기를 쓰는 곳(문지기·결산·감사·커밋 트리)이 모두 이것을 쓴다. */
export const diskReader =
  (root: string): ReadContent =>
  (rel) =>
    readFile(join(root, rel), 'utf8').catch(() => null);

// 기본 거버넌스 대상 코드 확장자. 비코드(.md/.json/.css 등)는 대상이 아니다.
const CODE_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.rb',
  '.php',
  '.kt',
  '.swift',
]);

// 거버넌스 대상 코드 파일인지 판단한다 (확장자 기준).
// gap 탐지뿐 아니라 태그 정합성 전체 스캔에서도 비코드 파일(.md 등)을
// 제외하는 데 재사용된다.
export function isCodeFile(rel: string): boolean {
  return CODE_EXT.has(extname(rel).toLowerCase());
}

// 주어진 파일들 중 @concept 태그가 없는 코드 파일 경로를 반환한다.
// - 비코드 확장자, ignoreGlobs 매칭 파일은 대상에서 제외한다.
// - 개념 없음 영역(noConceptGlobs) 안의 파일은 표식이 없어도 `@concept:none`을 단 것으로 친다.
// - 읽을 수 없는 파일(삭제/부재)은 개념 없음으로 보지 않고 건너뛴다.
// - read를 넘기면 디스크 대신 그 내용으로 판정한다(문지기: 커밋될 내용 기준).
export async function findConceptlessFiles(
  root: string,
  files: string[],
  ignoreGlobs: string[],
  noConceptGlobs: string[] = [],
  read: ReadContent = diskReader(root)
): Promise<string[]> {
  const conceptless: string[] = [];
  for (const rel of files) {
    if (!isCodeFile(rel)) continue;
    if (matchesAny(rel, ignoreGlobs) || matchesAny(rel, noConceptGlobs)) continue;
    const content = await read(rel);
    if (content === null) continue;
    if (conceptTagSlugs(leadingCommentBlock(content)).length === 0) conceptless.push(rel);
  }
  return conceptless;
}

export interface NoConceptCount {
  /** 첫머리 표식이 `@concept:none`뿐인 코드 파일 */
  none: string[];
  /** 판정한 거버넌스 대상 코드 파일 수(무시 목록·비코드·읽기 실패 제외) */
  total: number;
}

// 주어진 파일들 가운데 '해당 개념 없음'(@concept:none) 표식만 단 코드 파일을 센다.
// 표식은 개념 없음을 명시하는 정당한 장치지만, 커밋의 코드 파일 다수가 그것이면 개념 정의를
// 건너뛰는 통로가 되므로 안내의 재료로 쓴다(concept-code-mapping). 대상 판정은 findConceptlessFiles와 같다.
// 개념 없음 영역은 사람이 이미 정한 판단이므로 영역 안의 파일은 세지 않는다(파일마다 다는 "없음"만 센다).
export async function findNoConceptFiles(
  root: string,
  files: string[],
  ignoreGlobs: string[],
  noConceptGlobs: string[] = [],
  read: ReadContent = diskReader(root)
): Promise<NoConceptCount> {
  const none: string[] = [];
  let total = 0;
  for (const rel of files) {
    if (!isCodeFile(rel)) continue;
    if (matchesAny(rel, ignoreGlobs) || matchesAny(rel, noConceptGlobs)) continue;
    const content = await read(rel);
    if (content === null) continue;
    total++;
    const slugs = conceptTagSlugs(leadingCommentBlock(content));
    if (slugs.length > 0 && slugs.every((s) => s === NO_CONCEPT_TAG)) none.push(rel);
  }
  return { none, total };
}
