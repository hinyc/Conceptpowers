// @concept:reference-sync @concept:reference-privacy
// src/reference/lock.ts
// 참고자료 기준점(.alignment/reference.lock.json) 읽기·쓰기·찍기. 기준점은 "이 자료 상태가
// 개념에 반영됐다"는 사람의 확인이므로 찍는 것은 명시적 명령(reference-snapshot)뿐이다.
// 저장소에 올릴지는 시작 설정(referenceLock)이 정하고, 찍을 때마다 .gitignore를 그에 맞춘다.
import { readFile, mkdir } from 'node:fs/promises';
import { cpPaths } from '../paths.js';
import { ReferenceLock, ReferenceLockEntry } from '../schema/alignment.js';
import { readInitConfig } from '../init/readConfig.js';
import { applyReferenceLockIgnore, type ReferenceLockMode } from '../init/referenceLockIgnore.js';
import { writeFileAtomic } from '../util/atomicWrite.js';
import { mapLimit } from '../util/mapLimit.js';
import { enumerateReference, type ReferenceTarget } from './enumerate.js';
import { fingerprintFile } from './fingerprint.js';

// 한 번에 여는 참고자료 파일 수 — 큰 PDF 수천 개를 동시에 읽어 메모리가 치솟지 않게 한다.
export const HASH_CONCURRENCY = 16;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const hasOwn = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

// 파일 목록은 항목마다 직접 검증한다 — 파일 이름이 __proto__ 같은 객체 속성 이름이어도 사라지지 않도록.
function parseLockFiles(raw: unknown): ReferenceLock['files'] {
  if (raw === undefined) return {};
  if (!isPlainObject(raw)) throw new Error('reference lock: files must be an object');
  return Object.fromEntries(
    Object.entries(raw).map(([key, entry]) => [key, ReferenceLockEntry.parse(entry)])
  );
}

// 없거나 깨졌으면 null — "기준점 없음"은 빈 기준점과 다르게 다뤄야 한다(전부 새 자료로 본다).
export async function readReferenceLock(root: string): Promise<ReferenceLock | null> {
  try {
    const raw: unknown = JSON.parse(await readFile(cpPaths(root).referenceLock, 'utf8'));
    if (!isPlainObject(raw)) return null;
    const { files, ...rest } = raw;
    return { ...ReferenceLock.parse({ ...rest, files: {} }), files: parseLockFiles(files) };
  } catch {
    return null;
  }
}

export async function writeReferenceLock(root: string, lock: ReferenceLock): Promise<void> {
  const p = cpPaths(root);
  await mkdir(p.alignmentDir, { recursive: true });
  await writeFileAtomic(p.referenceLock, JSON.stringify(lock, null, 2) + '\n');
}

export async function readReferenceLockMode(root: string): Promise<ReferenceLockMode> {
  return (await readInitConfig(root))?.referenceLock ?? 'shared';
}

export interface SnapshotResult {
  lock: ReferenceLock;
  repo: number;
  external: number;
  /** 목록에는 있었지만 읽지 못해 기준점에서 빠진 파일 수 */
  skipped: number;
  truncated: string[];
  unreachable: string[];
  mode: ReferenceLockMode;
}

async function fingerprintAll(
  targets: readonly ReferenceTarget[]
): Promise<Record<string, ReferenceLockEntry>> {
  const entries = await mapLimit(targets, HASH_CONCURRENCY, async (t) => ({
    key: t.key,
    entry: await fingerprintFile(t.abs),
  }));
  return Object.fromEntries(
    entries.flatMap(({ key, entry }) => (entry ? [[key, entry] as const] : []))
  );
}

// 현재 참고자료 전체의 지문을 기준점으로 찍는다. 읽지 못한 파일은 빼되 그 수를 알린다.
export async function snapshotReference(
  root: string,
  at: string = new Date().toISOString()
): Promise<SnapshotResult> {
  const inv = await enumerateReference(root);
  const files = await fingerprintAll(inv.targets);
  const lock: ReferenceLock = { version: 1, at, files, truncated: inv.truncated };
  await writeReferenceLock(root, lock);
  const mode = await readReferenceLockMode(root);
  await applyReferenceLockIgnore(root, mode);
  const kept = (origin: ReferenceTarget['origin']) =>
    inv.targets.filter((t) => t.origin === origin && hasOwn(files, t.key)).length;
  return {
    lock,
    repo: kept('repo'),
    external: kept('external'),
    skipped: inv.targets.length - Object.keys(files).length,
    truncated: inv.truncated,
    unreachable: inv.unreachable,
    mode,
  };
}
