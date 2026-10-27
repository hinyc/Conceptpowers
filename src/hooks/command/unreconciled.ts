// @concept:governance-mode @concept:drift-reconcile
// src/hooks/command/unreconciled.ts
// 커밋 뒤 결산이 실패한 커밋을 적어 두었다가 다음 결산 때 이어서 처리하게 한다 — 결산 실패가 조용히 사라져
// "어긋난 채 통과한 커밋은 이력에 남는다"가 깨지지 않게 한다. 기록은 저장소 작업 트리가 아니라 git 폴더 안에
// 두므로 커밋 대상이 되지 않는다(headWatch와 같은 자리).
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileAtomic } from '../../util/atomicWrite.js';
import { tryGit } from '../../util/git.js';

const RECORD = join('conceptpowers', 'unreconciled.json');
const SHA = /^[0-9a-f]{7,64}$/;

async function recordPath(root: string): Promise<string | null> {
  const gitDir = await tryGit(root, ['rev-parse', '--absolute-git-dir']);
  return gitDir ? join(gitDir.trim(), RECORD) : null;
}

/** 결산하지 못하고 남은 커밋. 기록이 없거나 읽을 수 없으면 빈 목록. */
export async function readUnreconciled(root: string): Promise<string[]> {
  const path = await recordPath(root);
  if (!path) return [];
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === 'string' && SHA.test(s))
      : [];
  } catch {
    return [];
  }
}

/** 결산하지 못한 커밋을 기존 기록에 더해 적는다(중복 없이). */
export async function addUnreconciled(root: string, shas: readonly string[]): Promise<void> {
  const path = await recordPath(root);
  if (!path) return;
  const next = [...new Set([...(await readUnreconciled(root)), ...shas])];
  await writeFileAtomic(path, JSON.stringify(next) + '\n');
}

/** 이어서 결산을 마쳤으면 기록을 지운다. */
export async function clearUnreconciled(root: string): Promise<void> {
  const path = await recordPath(root);
  if (path) await rm(path, { force: true });
}
