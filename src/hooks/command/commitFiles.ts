// @concept:governance-mode
// src/hooks/command/commitFiles.ts
// 커밋 계획(범위)에 따라 실제로 커밋될 파일 목록을 git에게 묻는다. 목록을 못 읽으면 빈 목록으로 삼키지 않고
// 던진다 — "검사할 파일 없음 = 통과"가 되지 않도록(fail-closed). 커밋 뒤 결산이 보는 실제 커밋 파일과
// 같은 잣대가 되도록 추가·수정·이름변경(ACMR)만 센다.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import type { CommitPlan } from './commitPlan.js';

const execFileAsync = promisify(execFile);
// 대형 커밋(수천 파일)에서도 잘리지 않도록 execFile 기본 1MB를 넉넉히 늘린다.
const MAX_BUFFER = 64 * 1024 * 1024;
const NAME_ARGS = ['--name-only', '-z', '--diff-filter=ACMR'];

export type CommitTarget = Extract<CommitPlan, { kind: 'commit' }>;

// core.quotePath=false + -z: 비-ASCII 경로를 따옴표로 감싸지 않고 NUL로 구분된 원본 그대로 받는다.
async function gitNames(cwd: string, args: string[], what: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-c', 'core.quotePath=false', '--no-pager', ...args],
      { cwd, maxBuffer: MAX_BUFFER }
    );
    return stdout
      .split('\0')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch (error) {
    throw new Error(
      `${what}을 읽지 못했습니다(git ${args.join(' ')}) — ${(error as Error).message}`
    );
  }
}

const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];

export async function resolveCommitFiles(root: string, plan: CommitTarget): Promise<string[]> {
  const cwd = plan.cwd ? resolve(root, plan.cwd) : root;
  const staged = () => gitNames(cwd, ['diff', '--cached', ...NAME_ARGS], '스테이징 목록');
  const unstaged = (paths: string[]) =>
    gitNames(
      cwd,
      ['diff', ...NAME_ARGS, ...(paths.length > 0 ? ['--', ...paths] : [])],
      '미스테이징 변경 목록'
    );
  switch (plan.scope) {
    case 'index':
      return staged();
    case 'all':
      return union(await staged(), await unstaged([]));
    case 'include':
      return union(await staged(), await unstaged(plan.pathspecs));
    case 'only':
      // 경로 없는 --only(--amend -o)는 새 변경을 넣지 않는다.
      if (plan.pathspecs.length === 0) return [];
      return gitNames(
        cwd,
        ['diff', 'HEAD', ...NAME_ARGS, '--', ...plan.pathspecs],
        '지정 경로의 변경 목록'
      );
  }
}

// git alias 조회기 — 모르는 하위 명령일 때만 불린다. 조회 실패·없음은 null(커밋 아님으로 본다).
export function createAliasResolver(root: string): (name: string) => Promise<string | null> {
  return async (name) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) return null;
    try {
      const { stdout } = await execFileAsync('git', ['config', '--get', `alias.${name}`], {
        cwd: root,
        timeout: 2000,
      });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  };
}
