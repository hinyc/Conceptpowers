// @concept:concept-provenance
// src/audit/codeCoordinates.ts
// 개념의 근거(sources)와 코드 연결 목록(codeLinks)에 적힌 코드 자리가 지금도 실재하는지 확인한다.
// 코드가 규칙을 지키는지는 보지 않는다 — 가리키는 파일이 있는지, 짚은 심볼이 그 파일에 남아 있는지,
// 적은 줄 범위가 파일 길이 안에 있는지만 본다. 자리 설명은 자유 글이므로 코드 표기로 보이는 조각만 확인하고
// 나머지(설명 문장)는 판정하지 않는다 — 확인할 수 없는 것을 깨졌다고 단정하지 않는다.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Concept } from '../schema/concept.js';

export type CoordinateProblem = 'missing-file' | 'missing-symbol' | 'line-out-of-range';

export interface BrokenCodeCoordinate {
  slug: string;
  field: 'codeLinks' | 'sources';
  path: string;
  locator?: string;
  problem: CoordinateProblem;
  /** 찾지 못한 심볼, 또는 파일 길이를 넘는 줄 번호 */
  detail?: string[];
}

const CALL = /([A-Za-z_$][\w$]*)\s*\(/g;
const CONSTANT = /\b([A-Z][A-Z0-9_]{2,})\b/g;
// 첫 글자 뒤에 대문자가 섞인 이름(camelCase·PascalCase 약어) — 문장 첫 단어(Their)는 제외된다.
const MIXED = /\b([A-Za-z_$][a-z0-9_$]*[A-Z][\w$]*)\b/g;
const LINE_RANGE = /(\d+)\s*[~\-–]\s*(\d+)\s*행|\bL(\d+)(?:\s*-\s*L?(\d+))?\b/g;

// 자리 설명에서 코드 표기로 보이는 심볼만 뽑는다.
export function locatorSymbols(locator: string): string[] {
  const found = new Set<string>();
  for (const pattern of [CALL, CONSTANT, MIXED]) {
    for (const match of locator.matchAll(pattern)) found.add(match[1]);
  }
  return [...found];
}

// 자리 설명에 적힌 줄 번호 가운데 가장 큰 값. 없으면 null.
export function locatorMaxLine(locator: string): number | null {
  const numbers = [...locator.matchAll(LINE_RANGE)]
    .flatMap((m) => [m[1], m[2], m[3], m[4]])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

const cleanPath = (path: string): string => path.split('#')[0].trim();

async function readTarget(root: string, path: string): Promise<string | null | 'dir'> {
  try {
    const info = await stat(join(root, path));
    if (info.isDirectory()) return 'dir';
    return await readFile(join(root, path), 'utf8');
  } catch {
    return null;
  }
}

async function checkSource(
  root: string,
  slug: string,
  path: string,
  locator: string
): Promise<BrokenCodeCoordinate | null> {
  const target = await readTarget(root, path);
  if (target === null) return { slug, field: 'sources', path, locator, problem: 'missing-file' };
  if (target === 'dir' || !locator.trim()) return null;
  const missing = locatorSymbols(locator).filter((symbol) => !target.includes(symbol));
  if (missing.length > 0) {
    return { slug, field: 'sources', path, locator, problem: 'missing-symbol', detail: missing };
  }
  const maxLine = locatorMaxLine(locator);
  const lineCount = target.split('\n').length;
  if (maxLine !== null && maxLine > lineCount) {
    return {
      slug,
      field: 'sources',
      path,
      locator,
      problem: 'line-out-of-range',
      detail: [`${maxLine} > ${lineCount}`],
    };
  }
  return null;
}

export async function findBrokenCodeCoordinates(
  root: string,
  concepts: readonly Concept[]
): Promise<BrokenCodeCoordinate[]> {
  const checks = concepts.flatMap((concept) => [
    ...(concept.codeLinks ?? []).map(async (link) => {
      const path = cleanPath(link);
      return (await readTarget(root, path)) === null
        ? ({ slug: concept.slug, field: 'codeLinks', path, problem: 'missing-file' } as const)
        : null;
    }),
    ...(concept.sources ?? [])
      .filter((source) => source.kind === 'code')
      .map((source) => checkSource(root, concept.slug, cleanPath(source.path), source.locator)),
  ]);
  const results = await Promise.all(checks);
  return results.filter((r): r is BrokenCodeCoordinate => r !== null);
}
