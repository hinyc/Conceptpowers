// @concept:concept-code-mapping
// src/audit/gaps.ts
// 개념 없는 코드(@concept 태그가 없는 거버넌스 대상 코드 파일) 탐지.
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { matchesAny } from '../util/glob.js';
import { leadingCommentBlock } from '../mapping/leadingComment.js';

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

const TAG_RE = /@concept:[a-z0-9]+(?:-[a-z0-9]+)*/;
const TAG_RE_ALL = /@concept:([a-z0-9]+(?:-[a-z0-9]+)*)/g;

// 거버넌스 대상 코드 파일인지 판단한다 (확장자 기준).
// gap 탐지뿐 아니라 태그 정합성 전체 스캔에서도 비코드 파일(.md 등)을
// 제외하는 데 재사용된다.
export function isCodeFile(rel: string): boolean {
  return CODE_EXT.has(extname(rel).toLowerCase());
}

// 주어진 파일들 중 @concept 태그가 없는 코드 파일 경로를 반환한다.
// - 비코드 확장자, ignoreGlobs 매칭 파일은 대상에서 제외한다.
// - 읽을 수 없는 파일(삭제/부재)은 개념 없음으로 보지 않고 건너뛴다.
export async function findConceptlessFiles(
  root: string,
  files: string[],
  ignoreGlobs: string[]
): Promise<string[]> {
  const conceptless: string[] = [];
  for (const rel of files) {
    if (!isCodeFile(rel)) continue;
    if (matchesAny(rel, ignoreGlobs)) continue;
    let content: string;
    try {
      content = await readFile(join(root, rel), 'utf8');
    } catch {
      continue;
    }
    if (!TAG_RE.test(leadingCommentBlock(content))) conceptless.push(rel);
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
export async function findNoConceptFiles(
  root: string,
  files: string[],
  ignoreGlobs: string[]
): Promise<NoConceptCount> {
  const none: string[] = [];
  let total = 0;
  for (const rel of files) {
    if (!isCodeFile(rel)) continue;
    if (matchesAny(rel, ignoreGlobs)) continue;
    let content: string;
    try {
      content = await readFile(join(root, rel), 'utf8');
    } catch {
      continue;
    }
    total++;
    const slugs = [...leadingCommentBlock(content).matchAll(TAG_RE_ALL)].map((m) => m[1]);
    if (slugs.length > 0 && slugs.every((s) => s === 'none')) none.push(rel);
  }
  return { none, total };
}
