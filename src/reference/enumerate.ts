// @concept:reference-sync @concept:reference-first-duty
// src/reference/enumerate.ts
// 지문을 찍을 참고자료 목록을 만든다 — 저장소 안 폴더의 파일과, 경로 목록에 등록된 바깥 위치의
// 파일 전부. 각 파일에 안정적인 열쇠를 붙여 기준점과 개념의 근거 경로가 같은 이름으로 만나게 한다.
// 저장소 안과 바깥은 같은 건너뛰기 규칙(점 이름·0바이트)을 쓴다.
import { stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { CP_REL, cpPaths } from '../paths.js';
import { listReferenceFiles } from '../init/reference.js';
import { checkReferencePaths } from '../init/referencePaths.js';
import {
  walkUsableFiles,
  statUsableFile,
  SCAN_LIMIT,
  type UsableFileStat,
} from '../init/referenceWalk.js';

export type ReferenceOrigin = 'repo' | 'external';

export interface ReferenceTarget {
  /** 기준점·근거 대조에 쓰는 열쇠 */
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
  /** 이 기기에서 닿지 않거나(없음) 읽을 수 없는 등록 경로 */
  unreachable: string[];
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/** 저장소 안 파일의 열쇠: 저장소 상대 경로 — 개념 근거가 이미 쓰는 형태다. */
export function repoKey(rel: string): string {
  return `${CP_REL}/reference/${toPosix(rel)}`;
}

/** 등록 폴더 안 파일의 열쇠: 등록 경로(끝 슬래시 제거) + 상대 경로. */
export function externalKey(raw: string, rel: string): string {
  const base = toPosix(raw).replace(/\/+$/, '');
  return `${base}/${toPosix(rel)}`;
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

async function listRepo(root: string): Promise<ReferenceTarget[]> {
  const refDir = cpPaths(root).reference;
  const rels = (await listReferenceFiles(root)).filter((rel) => !hasDotSegment(rel));
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
  outcome: 'ok' | 'capped' | 'unreachable';
}

async function listExternal(
  raw: string,
  resolved: string,
  limit: number
): Promise<ExternalListing> {
  let isFile: boolean;
  try {
    isFile = (await stat(resolved)).isFile();
  } catch {
    return { targets: [], outcome: 'unreachable' };
  }
  if (isFile) {
    const s = await statUsableFile(resolved);
    const targets = s ? [target(toPosix(raw), resolved, 'external', raw, s)] : [];
    return { targets, outcome: 'ok' };
  }
  const found: ReferenceTarget[] = [];
  const walk = await walkUsableFiles(
    resolved,
    (abs, s) => {
      found.push(target(externalKey(raw, relative(resolved, abs)), abs, 'external', raw, s));
      return true;
    },
    limit
  );
  const outcome = walk === 'capped' ? 'capped' : walk === 'unreadable' ? 'unreachable' : 'ok';
  return { targets: found, outcome };
}

function sortedUnique(targets: readonly ReferenceTarget[]): ReferenceTarget[] {
  const sorted = [...targets].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return sorted.filter((t, i) => i === 0 || t.key !== sorted[i - 1].key);
}

export async function enumerateReference(
  root: string,
  opts: { limit?: number } = {}
): Promise<ReferenceInventory> {
  const limit = opts.limit ?? SCAN_LIMIT;
  const repo = await listRepo(root);
  // missing이 아닌 등록 경로는 전부 훑는다 — empty로 보였던 폴더도 실제로 비었는지 walker가 다시 가린다.
  const checks = await checkReferencePaths(root);
  const unreachable = checks.filter((c) => c.status === 'missing').map((c) => c.raw);
  const external: ReferenceTarget[] = [];
  const truncated: string[] = [];
  for (const c of checks.filter((x) => x.status !== 'missing')) {
    const r = await listExternal(c.raw, c.resolved, limit);
    external.push(...r.targets);
    if (r.outcome === 'capped') truncated.push(c.raw);
    if (r.outcome === 'unreachable') unreachable.push(c.raw);
  }
  return { targets: sortedUnique([...repo, ...external]), truncated, unreachable };
}
