// @concept:reference-sync
// src/reference/diff.ts
// 현재 참고자료를 기준점과 견줘 추가·변경·삭제를 가려내고, 변경·삭제된 자료의 영향 개념을 찾는다.
// quick 모드는 크기·시각이 같은 파일의 내용을 읽지 않는다(세션 시작용). full은 전부 해시한다.
import { listConcepts } from '../store/conceptStore.js';
import type { Concept } from '../schema/concept.js';
import type { ReferenceLock, ReferenceLockEntry } from '../schema/alignment.js';
import { mapLimit } from '../util/mapLimit.js';
import { enumerateReference, type ReferenceInventory, type ReferenceTarget } from './enumerate.js';
import { hashFile } from './fingerprint.js';
import { readReferenceLock, HASH_CONCURRENCY } from './lock.js';
import { findAffectedConcepts, type AffectedConcept } from './affected.js';

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

// 닿지 않는 등록 경로 아래의 열쇠는 삭제로 세지 않는다 — 다른 기기의 팀원에게 전부 삭제로
// 보이지 않게 하기 위해서다.
function underUnreachable(key: string, unreachable: readonly string[]): boolean {
  return unreachable.some((raw) => {
    const base = raw.replace(/\\/g, '/').replace(/\/+$/, '');
    return key === base || key.startsWith(`${base}/`);
  });
}

function uncited(concepts: readonly Concept[], keys: readonly string[]): string[] {
  return keys.filter((k) => findAffectedConcepts(concepts, [k]).length === 0);
}

async function unlockedDiff(root: string, inv: ReferenceInventory): Promise<ReferenceDiff> {
  const added = inv.targets.map((t) => t.key);
  return {
    unlocked: true,
    added,
    newMaterial: uncited(await listConcepts(root), added),
    changed: [],
    removed: [],
    affected: [],
    unreachable: inv.unreachable,
    truncated: inv.truncated,
  };
}

async function splitCurrent(
  inv: ReferenceInventory,
  lock: ReferenceLock,
  mode: DiffMode
): Promise<{ added: string[]; changed: string[] }> {
  const added = inv.targets.filter((t) => !(t.key in lock.files)).map((t) => t.key);
  const known = inv.targets.filter((t) => t.key in lock.files);
  const flags = await mapLimit(known, HASH_CONCURRENCY, (t) =>
    isChanged(t, lock.files[t.key], mode)
  );
  const changed = known.filter((_, i) => flags[i]).map((t) => t.key);
  return { added, changed };
}

export async function diffReference(root: string, mode: DiffMode = 'full'): Promise<ReferenceDiff> {
  const inv = await enumerateReference(root);
  const lock = await readReferenceLock(root);
  if (!lock) return unlockedDiff(root, inv);
  const { added, changed } = await splitCurrent(inv, lock, mode);
  const current = new Set(inv.targets.map((t) => t.key));
  const removed = Object.keys(lock.files)
    .filter((k) => !current.has(k))
    .filter((k) => !underUnreachable(k, inv.unreachable))
    .sort();
  const concepts = await listConcepts(root);
  return {
    unlocked: false,
    added,
    newMaterial: uncited(concepts, added),
    changed,
    removed,
    affected: findAffectedConcepts(concepts, [...changed, ...removed]),
    unreachable: inv.unreachable,
    truncated: inv.truncated,
  };
}
