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

// 코드 표기로 확신할 수 있는 모양만 심볼로 본다. 약어(CSRF·JSON)·제품명(GitHub·iOS)처럼 설명 문장에도 흔한
// 모양은 뽑지 않는다 — 꼭 확인받고 싶은 이름은 백틱(`CONTENT`)으로 감싸 적는다.
const BACKTICKED = /`\s*([A-Za-z_$][\w$]*)\s*(?:\(\s*\))?\s*`/g;
// 이름 바로 뒤의 여는 괄호 — "FeatureSchema (필드)"처럼 띄어 쓴 괄호, "README.md(설치 절차)"처럼 안에 한글
// 설명을 단 괄호, "eslint-disable(rules)"처럼 하이픈으로 이어진 낱말은 설명으로 본다.
const CALL = /(?<![\w$-])([A-Za-z_$][\w$]*)\((?![^)]*[가-힣])/g;
// 밑줄이 든 대문자 상수(MAX_BODY) — 밑줄 없는 대문자 단어는 약어와 구별되지 않는다.
const CONSTANT = /\b([A-Z][A-Z0-9]*_[A-Z0-9_]*[A-Z0-9])\b/g;
// 소문자 두 자 이상으로 시작해 대문자 뒤에 소문자가 이어지는 이름(saveBtn) — iOS·macOS·iPhone은 제외된다.
const LOWER_CAMEL = /\b([a-z][a-z0-9]+[A-Z][a-z0-9]+[A-Za-z0-9]*)\b/g;
// 인용문은 코드가 아니라 문장이다 — 그 안의 단어는 판정하지 않는다.
// 낱말 속 아포스트로피(user's)는 인용 부호가 아니다.
const QUOTED = /"[^"]*"|(?<![A-Za-z])'[^']*'(?![A-Za-z])|“[^”]*”|‘[^’]*’/g;
const LINE_RANGE = /(\d+)\s*(?:[~\-–]\s*(\d+)\s*)?(?:행|줄)|\bL(\d+)(?:\s*[-–~]\s*L?(\d+))?\b/g;

// 자리 설명에서 코드 표기로 보이는 심볼만 뽑는다.
export function locatorSymbols(locator: string): string[] {
  const backticked = [...locator.matchAll(BACKTICKED)].map((m) => m[1]);
  const prose = locator.replace(QUOTED, ' ');
  const patterned = [CALL, CONSTANT, LOWER_CAMEL].flatMap((pattern) =>
    [...prose.matchAll(pattern)].map((m) => m[1])
  );
  return [...new Set([...backticked, ...patterned])];
}

// 자리 설명에 적힌 줄 번호 가운데 가장 큰 값. 없으면 null.
export function locatorMaxLine(locator: string): number | null {
  const numbers = [...locator.matchAll(LINE_RANGE)]
    .flatMap((m) => [m[1], m[2], m[3], m[4]])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 이름 단위로 찾는다 — saveBtn이 남아 있다고 사라진 save를 있다고 보지 않는다.
const containsSymbol = (text: string, symbol: string): boolean =>
  new RegExp(`(?<![\\w$])${escapeRegExp(symbol)}(?![\\w$])`).test(text);

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

// 심볼과 줄 범위는 따로 본다 — 한쪽 문제가 다른 쪽 문제를 가리지 않게 둘 다 알린다.
async function checkSource(
  root: string,
  slug: string,
  path: string,
  locator: string
): Promise<BrokenCodeCoordinate[]> {
  const target = await readTarget(root, path);
  if (target === null) return [{ slug, field: 'sources', path, locator, problem: 'missing-file' }];
  if (target === 'dir' || !locator.trim()) return [];
  const base = { slug, field: 'sources' as const, path, locator };
  const missing = locatorSymbols(locator).filter((symbol) => !containsSymbol(target, symbol));
  const maxLine = locatorMaxLine(locator);
  const lineCount = target.split('\n').length;
  const symbolProblems: BrokenCodeCoordinate[] =
    missing.length > 0 ? [{ ...base, problem: 'missing-symbol', detail: missing }] : [];
  const lineProblems: BrokenCodeCoordinate[] =
    maxLine !== null && maxLine > lineCount
      ? [{ ...base, problem: 'line-out-of-range', detail: [`${maxLine} > ${lineCount}`] }]
      : [];
  return [...symbolProblems, ...lineProblems];
}

export async function findBrokenCodeCoordinates(
  root: string,
  concepts: readonly Concept[]
): Promise<BrokenCodeCoordinate[]> {
  const checks = concepts.flatMap((concept) => [
    ...(concept.codeLinks ?? []).map(async (link) => {
      const path = cleanPath(link);
      return (await readTarget(root, path)) === null
        ? [{ slug: concept.slug, field: 'codeLinks', path, problem: 'missing-file' } as const]
        : [];
    }),
    ...(concept.sources ?? [])
      .filter((source) => source.kind === 'code')
      .map((source) => checkSource(root, concept.slug, cleanPath(source.path), source.locator)),
  ]);
  const results: BrokenCodeCoordinate[][] = await Promise.all(checks);
  return results.flat();
}
