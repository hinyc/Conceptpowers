// @concept:pending-diff
// src/store/approvedSnapshot.ts — 확정(green) 개념이 검토 중(pending)으로 내려가기 직전의 전체 내용(승인본) 보관소.
// 파일: docs/conceptpowers/concepts/.approved/<slug>.json. 개념 목록(concepts/data)과 섞이지 않는 따로 둔 폴더다.
import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { cpPaths } from '../paths.js';
import { writeFileAtomic } from '../util/atomicWrite.js';
import { parseConcept, SlugSchema, type Concept } from '../schema/concept.js';

export interface ApprovedSnapshot {
  slug: string;
  savedAt: string;
  concept: Concept;
}

// slug는 이름표 모양(kebab-case)만 허용한다 — 경로 구분자·`..`로 승인본 폴더를 벗어날 수 없다.
function fileOf(root: string, slug: string): string {
  const safe = SlugSchema.parse(slug);
  return join(cpPaths(root).approvedDir, `${safe}.json`);
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

export async function saveApprovedSnapshot(root: string, concept: Concept): Promise<void> {
  const snapshot: ApprovedSnapshot = {
    slug: concept.slug,
    savedAt: new Date().toISOString(),
    concept,
  };
  await writeFileAtomic(fileOf(root, concept.slug), JSON.stringify(snapshot, null, 2) + '\n');
}

// 파일 없음 → null, 형식이 깨졌으면 Error(비교 불가 이유를 호출자가 알린다).
export async function readApprovedSnapshot(
  root: string,
  slug: string
): Promise<ApprovedSnapshot | null> {
  const file = fileOf(root, slug);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (raw === null || typeof raw !== 'object' || raw.slug !== slug) {
      throw new Error('slug does not match the file');
    }
    if (typeof raw.savedAt !== 'string' || Number.isNaN(Date.parse(raw.savedAt))) {
      throw new Error('savedAt is not an ISO time');
    }
    const concept = parseConcept(raw.concept);
    if (concept.slug !== slug) throw new Error('concept slug does not match the file');
    return { slug, savedAt: raw.savedAt, concept };
  } catch (error) {
    throw new Error(`Malformed approved snapshot for ${slug}: ${(error as Error).message}`);
  }
}

// 없으면 조용히 끝난다.
export async function removeApprovedSnapshot(root: string, slug: string): Promise<void> {
  await rm(fileOf(root, slug), { force: true });
}

// 되돌리기용 원문 판독·복원 — 개념 쓰기가 실패했을 때 직전 승인본을 글자 그대로 되살린다(깨진 파일이어도).
export async function readApprovedRaw(root: string, slug: string): Promise<string | null> {
  try {
    return await readFile(fileOf(root, slug), 'utf8');
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export async function restoreApprovedRaw(
  root: string,
  slug: string,
  previous: string | null
): Promise<void> {
  if (previous === null) await removeApprovedSnapshot(root, slug);
  else await writeFileAtomic(fileOf(root, slug), previous);
}

// 승인본 폴더 정리 — 사라진 개념이거나 지금 green인 개념의 승인본을 지운다(pending/red는 둔다).
// 하나가 지워지지 않아도 나머지는 계속 지우고, 끝에 실패를 모아 던진다(결산은 실패를 따로 알린다).
export async function pruneApprovedSnapshots(
  root: string,
  liveSlugs: ReadonlySet<string>,
  greenSlugs: ReadonlySet<string>
): Promise<string[]> {
  const dir = cpPaths(root).approvedDir;
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const removed: string[] = [];
  const failures: string[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const slug = name.slice(0, -'.json'.length);
    if (liveSlugs.has(slug) && !greenSlugs.has(slug)) continue;
    try {
      await rm(join(dir, name));
      removed.push(slug);
    } catch (error) {
      failures.push(`${name}: ${(error as Error).message}`);
    }
  }
  if (failures.length > 0) throw new Error(`Failed to prune approved snapshots — ${failures.join('; ')}`);
  return removed;
}
