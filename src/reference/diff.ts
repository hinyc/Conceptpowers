// @concept:reference-sync
// src/reference/diff.ts
// 현재 참고자료를 기준점과 견줘 추가·변경·삭제를 가려내고, 변경·삭제된 자료의 영향 개념을 찾는다.
// quick 모드는 크기·시각이 같은 파일의 내용을 읽지 않는다(세션 시작용). full은 전부 해시한다.
import { listConcepts } from '../store/conceptStore.js';
import type { Concept } from '../schema/concept.js';
import type { ReferenceLock, ReferenceLockEntry } from '../schema/alignment.js';
import type { ReferencePathCheck } from '../init/referencePaths.js';
import { mapLimit } from '../util/mapLimit.js';
import { enumerateReference, type ReferenceInventory, type ReferenceTarget } from './enumerate.js';
import { canonicalKeyOf, isAbsoluteKey, type PathAliases } from './canonical.js';
import { hashFile } from './fingerprint.js';
import { readReferenceLock, HASH_CONCURRENCY } from './lock.js';
import {
  citedMatcher,
  findAffectedConcepts,
  type AffectedConcept,
  type PathCanon,
} from './affected.js';

export type DiffMode = 'full' | 'quick';

export interface ReferenceDiff {
  /** 기준점이 없어 전부 새 자료로 본 경우 */
  unlocked: boolean;
  added: string[];
  /** added 가운데 어떤 개념도 근거로 삼지 않은 것 — 새 개념 후보 */
  newMaterial: string[];
  changed: string[];
  removed: string[];
  affected: AffectedConcept[];
  unreachable: string[];
  truncated: string[];
}

/** 호출한 쪽이 이미 읽어 둔 재료 — 넘기면 다시 읽지 않는다(세션 시작 훅의 중복 조회 제거). */
export interface DiffInputs {
  checks?: readonly ReferencePathCheck[];
  repoFiles?: readonly string[];
  concepts?: readonly Concept[];
  /** null이면 "기준점 없음"으로 확정된 것 — undefined일 때만 읽는다 */
  lock?: ReferenceLock | null;
}

// 기준점 열쇠는 Map으로 다룬다 — 파일 이름이 constructor 같은 객체 속성 이름과 겹쳐도 오판하지 않도록.
type LockFiles = ReadonlyMap<string, ReferenceLockEntry>;

export function isEmptyDiff(d: ReferenceDiff): boolean {
  return d.added.length === 0 && d.changed.length === 0 && d.removed.length === 0;
}

// 목록을 만들 때 받은 크기·시각을 그대로 쓴다 — quick 모드는 stat을 다시 하지 않는다.
async function isChanged(
  t: ReferenceTarget,
  prev: ReferenceLockEntry,
  mode: DiffMode
): Promise<boolean> {
  if (mode === 'quick' && t.size === prev.size && t.mtime === prev.mtime) return false;
  try {
    return (await hashFile(t.abs)) !== prev.hash;
  } catch {
    return false; // 견주는 사이 사라진 파일은 이번엔 판정하지 않는다
  }
}

// 열쇠가 위치 아래에 있으면 그 위치의 구체성(깊이), 아니면 -1. 저장소 루트(.)가 가장 넓다.
function depthUnder(key: string, base: string): number {
  if (base === '.') return !key.startsWith('~') && !isAbsoluteKey(key) ? 0 : -1;
  if (base === '/') return key.startsWith('/') ? 1 : -1;
  const under = key === base || key.startsWith(`${base}/`);
  return under ? base.split('/').length + 1 : -1;
}

const deepest = (key: string, bases: readonly string[]): number =>
  bases.reduce((best, b) => Math.max(best, depthUnder(key, b)), -1);

/**
 * 기준점에만 있는 열쇠를 삭제로 셀지 정한다 — 가장 구체적인 위치가 판정한다.
 * 닿지 않는 위치 아래면 세지 않는다(다른 기기의 팀원에게 전부 삭제로 보이지 않게). 다만 더 구체적인
 * 닿는 위치 아래라면 실제로 사라진 것이므로 센다. 다른 기기 홈의 ~/… 표기는 같은 깊이의 닿는 위치에 진다.
 */
export function countsAsRemoved(
  key: string,
  unreachableBases: readonly string[],
  reachableBases: readonly string[],
  portableBases: readonly string[] = []
): boolean {
  const u = deepest(key, unreachableBases);
  const p = deepest(key, portableBases);
  if (u < 0 && p < 0) return true;
  const r = deepest(key, reachableBases);
  return r > u && r >= p;
}

function memoCanon(root: string, aliases: PathAliases): PathCanon {
  const memo = new Map<string, string>();
  return (path) => {
    const hit = memo.get(path);
    if (hit !== undefined) return hit;
    const value = canonicalKeyOf(root, path, aliases);
    memo.set(path, value);
    return value;
  };
}

// 옛 기준점은 등록 경로를 적힌 그대로(절대·./·../ 등) 열쇠로 남겼을 수 있다 — 지금의 정규 표기로 모은다.
// 둘이 같은 열쇠로 모이면 이미 정규형인 쪽을 남긴다.
function canonicalLockFiles(files: ReferenceLock['files'], canon: PathCanon): LockFiles {
  const own = new Map(Object.entries(files));
  const pairs = [...own].map(([key, entry]) => [key, canon(key), entry] as const);
  return new Map(
    pairs
      .filter(([key, canonKey]) => canonKey === key || !own.has(canonKey))
      .map(([, canonKey, entry]) => [canonKey, entry] as const)
  );
}

function unlockedDiff(
  inv: ReferenceInventory,
  concepts: readonly Concept[],
  canon: PathCanon
): ReferenceDiff {
  const added = inv.targets.map((t) => t.key);
  const isCited = citedMatcher(concepts, canon);
  return {
    unlocked: true,
    added,
    newMaterial: added.filter((k) => !isCited(k)),
    changed: [],
    removed: [],
    affected: [],
    unreachable: inv.unreachable,
    truncated: inv.truncated,
  };
}

async function splitCurrent(
  inv: ReferenceInventory,
  files: LockFiles,
  mode: DiffMode
): Promise<{ added: string[]; changed: string[] }> {
  const added = inv.targets.filter((t) => !files.has(t.key)).map((t) => t.key);
  const known = inv.targets.filter((t) => files.has(t.key));
  const flags = await mapLimit(known, HASH_CONCURRENCY, (t) =>
    isChanged(t, files.get(t.key) as ReferenceLockEntry, mode)
  );
  const changed = known.filter((_, i) => flags[i]).map((t) => t.key);
  return { added, changed };
}

export async function diffReference(
  root: string,
  mode: DiffMode = 'full',
  inputs: DiffInputs = {}
): Promise<ReferenceDiff> {
  const inv = await enumerateReference(root, {
    checks: inputs.checks,
    repoFiles: inputs.repoFiles,
  });
  const lock = inputs.lock !== undefined ? inputs.lock : await readReferenceLock(root);
  const concepts = inputs.concepts ?? (await listConcepts(root));
  const canon = memoCanon(root, inv.aliases);
  if (!lock) return unlockedDiff(inv, concepts, canon);
  const files = canonicalLockFiles(lock.files, canon);
  const { added, changed } = await splitCurrent(inv, files, mode);
  const current = new Set(inv.targets.map((t) => t.key));
  // 위치도 기준점 열쇠와 같은 규칙으로 모은다 — 다른 기기의 ~/… 가 이 기기에서는 저장소 상대가 될 수 있다.
  const unreachableBases = inv.unreachableBases.map(canon);
  const portableBases = inv.portableBases.map(canon);
  const removed = [...files.keys()]
    .filter((k) => !current.has(k))
    .filter((k) => countsAsRemoved(k, unreachableBases, inv.reachableBases, portableBases))
    .sort();
  const isCited = citedMatcher(concepts, canon);
  return {
    unlocked: false,
    added,
    newMaterial: added.filter((k) => !isCited(k)),
    changed,
    removed,
    affected: findAffectedConcepts(concepts, [...changed, ...removed], canon),
    unreachable: inv.unreachable,
    truncated: inv.truncated,
  };
}
