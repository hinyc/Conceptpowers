// @concept:settled-status
// pending 개념의 충돌 사유 저장소. 개념 JSON을 오염시키지 않도록 .alignment에 분리 보관한다.
import { z } from 'zod';
import { cpPaths } from '../paths.js';
import { readJsonRecordStrict } from '../util/readJsonStrict.js';
import { writeFileAtomic } from '../util/atomicWrite.js';

export type PendingConflicts = Record<string, string>;

const PendingConflictsSchema = z.record(z.string(), z.string());

// 판독은 이 엄격 판독 하나다(쓰기 경로·문지기 공용): 파일이 없을 때만 빈 기록. 깨진 파일(파싱·검증 실패)은
// 던져서 다른 개념의 충돌 사유를 빈 값으로 덮어쓰지 않게 한다.
export function readPendingConflictsStrict(root: string): Promise<PendingConflicts> {
  return readJsonRecordStrict(
    cpPaths(root).pendingConflicts,
    PendingConflictsSchema,
    '충돌 사유 기록 파일'
  );
}

export async function setPendingConflict(
  root: string,
  slug: string,
  reason: string
): Promise<void> {
  const current = await readPendingConflictsStrict(root);
  const next = { ...current, [slug]: reason };
  await writeFileAtomic(cpPaths(root).pendingConflicts, JSON.stringify(next, null, 2) + '\n');
}

export async function clearPendingConflict(root: string, slug: string): Promise<void> {
  const current = await readPendingConflictsStrict(root);
  if (!(slug in current)) return;
  const next = { ...current };
  delete next[slug];
  await writeFileAtomic(cpPaths(root).pendingConflicts, JSON.stringify(next, null, 2) + '\n');
}

// 사라진 개념의 낡은 충돌 사유를 지운다. 증빙·검토 기록과 같은 규칙이다.
export async function prunePendingConflicts(
  root: string,
  liveSlugs: ReadonlySet<string>
): Promise<string[]> {
  const current = await readPendingConflictsStrict(root);
  const dead = Object.keys(current).filter((slug) => !liveSlugs.has(slug));
  if (dead.length === 0) return [];
  const next: PendingConflicts = Object.fromEntries(
    Object.entries(current).filter(([slug]) => liveSlugs.has(slug))
  );
  await writeFileAtomic(cpPaths(root).pendingConflicts, JSON.stringify(next, null, 2) + '\n');
  return dead;
}
