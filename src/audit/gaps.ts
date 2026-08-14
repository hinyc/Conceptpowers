// @concept:audit-gap-detection
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
