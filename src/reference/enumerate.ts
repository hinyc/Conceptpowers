// @concept:reference-sync @concept:reference-first-duty
// src/reference/enumerate.ts
// 지문을 찍을 참고자료 목록을 만든다 — 저장소 안 폴더의 파일과, 경로 목록에 등록된 바깥 위치의
// 파일 전부. 각 파일에 정규 표기 열쇠(canonical.ts)를 붙여 기준점과 개념의 근거 경로가 같은 이름으로
// 만나게 한다. 저장소 안과 바깥은 같은 건너뛰기 규칙(점 이름·0바이트)을 쓴다.
//
// 열쇠는 언제나 적힌 이름에서 만든다 — 심볼릭 링크를 여기서만 풀면 옛 기준점·개념 근거(적힌 이름)와
// 한쪽만 어긋나고, 기기마다 링크 대상이 달라 공유 기준점이 깨진다. 저장소·홈 경로가 다른 이름으로
// 보이는 경우는 양쪽이 함께 쓰는 별칭(loadAliases)으로만 흡수한다.
import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CP_REL, cpPaths } from '../paths.js';
import { listReferenceFiles } from '../init/reference.js';
import { checkReferencePaths, type ReferencePathCheck } from '../init/referencePaths.js';
import {
  walkUsableFiles,
  statUsableFile,
  SCAN_LIMIT,
  type UsableFileStat,
} from '../init/referenceWalk.js';
import {
  canonicalPath,
  cleanPath,
  loadAliases,
  portableHomeForm,
  type PathAliases,
} from './canonical.js';

export type ReferenceOrigin = 'repo' | 'external';

export interface ReferenceTarget {
  /** 기준점·근거 대조에 쓰는 정규 표기 열쇠 */
  key: string;
  abs: string;
  origin: ReferenceOrigin;
  /** 등록 경로(paths.md에 적힌 그대로) — 저장소 안 파일은 빈 문자열 */
  raw: string;
  size: number;
  mtime: string;
}

export interface ReferenceInventory {
  /** 열쇠 오름차순, 중복 없음 */
  targets: ReferenceTarget[];
  /** 상한에 걸려 일부만 훑은 등록 경로 */
  truncated: string[];
  /** 이 기기에서 닿지 않거나(없음) 읽을 수 없는 등록 경로(적힌 그대로 — 보고용) */
  unreachable: string[];
  /** 닿지 않는 등록 위치의 정규 표기 — 이 아래 열쇠는 삭제로 세지 않는다 */
  unreachableBases: string[];
  /** 닿지 않는 등록 위치가 다른 기기의 홈일 때의 ~/… 표기 — 같은 깊이의 닿는 위치에는 진다 */
  portableBases: string[];
  /** 이 기기에서 닿는 위치의 정규 표기 — 이 아래 열쇠는 사라지면 삭제로 센다 */
  reachableBases: string[];
  aliases: PathAliases;
}

export interface EnumerateOptions {
  limit?: number;
  /** 이미 검증한 등록 경로 목록 — 넘기면 paths.md를 다시 읽지 않는다 */
  checks?: readonly ReferencePathCheck[];
  /** 이미 읽은 저장소 안 참고자료 목록 — 넘기면 폴더를 다시 훑지 않는다 */
  repoFiles?: readonly string[];
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/** 저장소 루트와 홈을 기준으로 등록 위치를 정규 표기로 바꾼다(별칭 없이 쓰는 순수 함수). */
export function canonicalBase(root: string, resolved: string, home: string = homedir()): string {
  return canonicalPath(resolved, { roots: [cleanPath(root)], homes: [cleanPath(home)] });
}

/** 저장소 안 파일의 열쇠: 저장소 상대 경로 — 개념 근거가 이미 쓰는 형태다. */
export function repoKey(rel: string): string {
  return cleanPath(`${CP_REL}/reference/${toPosix(rel)}`);
}

/** 등록 위치 표기 + 상대 경로(끝 슬래시 제거, 루트 / 는 겹치지 않게). */
export function externalKey(base: string, rel: string): string {
  const b = toPosix(base).replace(/\/+$/, '') || '/';
  return b === '/' ? `/${toPosix(rel)}` : `${b}/${toPosix(rel)}`;
}

function hasDotSegment(rel: string): boolean {
  return toPosix(rel)
    .split('/')
    .some((seg) => seg.startsWith('.'));
}

function target(
  key: string,
  abs: string,
  origin: ReferenceOrigin,
  raw: string,
  s: UsableFileStat
): ReferenceTarget {
  return { key, abs, origin, raw, size: s.size, mtime: s.mtime };
}

async function listRepo(root: string, files?: readonly string[]): Promise<ReferenceTarget[]> {
  const refDir = cpPaths(root).reference;
  const rels = (files ?? (await listReferenceFiles(root))).filter((rel) => !hasDotSegment(rel));
  const found = await Promise.all(
    rels.map(async (rel) => {
      const abs = join(refDir, rel);
      const s = await statUsableFile(abs);
      return s ? target(repoKey(rel), abs, 'repo', '', s) : null;
    })
  );
  return found.filter((t): t is ReferenceTarget => t !== null);
}

interface ExternalListing {
  targets: ReferenceTarget[];
  base: string;
  outcome: 'ok' | 'capped' | 'unreachable';
}

async function listExternal(
  check: ReferencePathCheck,
  aliases: PathAliases,
  limit: number
): Promise<ExternalListing> {
  const { raw, resolved } = check;
  const base = canonicalPath(resolved, aliases);
  let isFile: boolean;
  try {
    isFile = (await stat(resolved)).isFile();
  } catch {
    return { targets: [], base, outcome: 'unreachable' };
  }
  if (isFile) {
    const s = await statUsableFile(resolved);
    return { targets: s ? [target(base, resolved, 'external', raw, s)] : [], base, outcome: 'ok' };
  }
  const found: ReferenceTarget[] = [];
  const walk = await walkUsableFiles(
    resolved,
    (abs, s) => {
      found.push(target(canonicalPath(abs, aliases), abs, 'external', raw, s));
      return true;
    },
    limit
  );
  const outcome = walk === 'capped' ? 'capped' : walk === 'unreadable' ? 'unreachable' : 'ok';
  return { targets: found, base, outcome };
}

function sortedUnique(targets: readonly ReferenceTarget[]): ReferenceTarget[] {
  const sorted = [...targets].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return sorted.filter((t, i) => i === 0 || t.key !== sorted[i - 1].key);
}

const unique = (xs: readonly string[]): string[] => [...new Set(xs)];

export async function enumerateReference(
  root: string,
  opts: EnumerateOptions = {}
): Promise<ReferenceInventory> {
  const limit = opts.limit ?? SCAN_LIMIT;
  const aliases = await loadAliases(root);
  const repo = await listRepo(root, opts.repoFiles);
  // missing이 아닌 등록 경로는 전부 훑는다 — empty로 보였던 폴더도 실제로 비었는지 walker가 다시 가린다.
  const checks = opts.checks ?? (await checkReferencePaths(root));
  const unreachableChecks = checks.filter((c) => c.status === 'missing');
  const external: ReferenceTarget[] = [];
  const truncated: string[] = [];
  const reachableBases = [repoKey('')];
  for (const c of checks.filter((x) => x.status !== 'missing')) {
    const r = await listExternal(c, aliases, limit);
    external.push(...r.targets);
    if (r.outcome === 'capped') truncated.push(c.raw);
    if (r.outcome === 'unreachable') unreachableChecks.push(c);
    else reachableBases.push(r.base);
  }
  const portable = unreachableChecks.map((c) => portableHomeForm(c.resolved));
  return {
    targets: sortedUnique([...repo, ...external]),
    truncated,
    unreachable: unreachableChecks.map((c) => c.raw),
    unreachableBases: unique(unreachableChecks.map((c) => canonicalPath(c.resolved, aliases))),
    portableBases: unique(portable.filter((p): p is string => p !== null)),
    reachableBases: unique(reachableBases),
    aliases,
  };
}
