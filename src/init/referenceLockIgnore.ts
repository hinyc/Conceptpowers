// @concept:reference-sync @concept:reference-privacy
// src/init/referenceLockIgnore.ts
// 참고자료 기준점(reference.lock.json)을 저장소에 올릴지는 시작 설정(referenceLock)이 정한다.
// local이면 .alignment/.gitignore에 제외 줄을 넣고, shared면 그 줄을 뺀다. 사람이 적어둔 다른 줄은
// 그대로 둔다. 이미 추적 중인 파일을 local로 돌릴 때는 git에서 추적을 푸는 것이 사용자 몫이다.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cpPaths } from '../paths.js';
import { ensureAlignmentGitignore } from './alignmentGitignore.js';
import { writeFileAtomic } from '../util/atomicWrite.js';

export type ReferenceLockMode = 'local' | 'shared';
export type ReferenceLockIgnoreStatus = 'added' | 'removed' | 'unchanged';

const LOCK_LINE = 'reference.lock.json';

function withLine(lines: readonly string[]): string[] {
  return lines.includes(LOCK_LINE) ? [...lines] : [...lines, LOCK_LINE];
}

function withoutLine(lines: readonly string[]): string[] {
  return lines.filter((l) => l !== LOCK_LINE);
}

// 설정에 맞춰 제외 줄을 넣거나 뺀다. 바뀐 것이 없으면 파일을 다시 쓰지 않는다.
export async function applyReferenceLockIgnore(
  root: string,
  mode: ReferenceLockMode
): Promise<ReferenceLockIgnoreStatus> {
  await ensureAlignmentGitignore(root);
  const target = join(cpPaths(root).alignmentDir, '.gitignore');
  const lines = (await readFile(target, 'utf8')).replace(/\n$/, '').split('\n');
  const next = mode === 'local' ? withLine(lines) : withoutLine(lines);
  if (next.length === lines.length) return 'unchanged';
  await writeFileAtomic(target, next.join('\n') + '\n');
  return mode === 'local' ? 'added' : 'removed';
}
