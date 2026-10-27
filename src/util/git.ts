// @concept:none
// src/util/git.ts
// 문지기·결산이 쓰는 git 호출을 한 곳에서 같은 안전 설정으로 한다 — 호출마다 옵션이 어긋나면 같은 커밋을
// 두고 판정과 결산이 다른 목록을 보게 된다.
// - core.quotePath=false: 비ASCII 경로(예: src/認証.ts)를 따옴표로 감싸지 않고 원본 그대로 내보낸다.
// - diff.relative=false: 사용자 설정과 무관하게 저장소 전체 기준 경로를 받는다.
// - --no-pager, 넉넉한 출력 상한(대형 커밋·저장소에서도 잘리지 않게).
import { execFile } from 'node:child_process';

const SAFE_CONFIG = ['-c', 'core.quotePath=false', '-c', 'diff.relative=false'];
export const GIT_MAX_BUFFER = 64 * 1024 * 1024;

export interface GitOptions {
  /** 덧붙일 환경 변수(예: GIT_INDEX_FILE) — 나머지는 현재 환경을 그대로 쓴다 */
  env?: Record<string, string>;
  /** 표준 입력으로 넘길 내용(경로 목록 등) */
  input?: string;
  /** 실행 시간 상한(밀리초) — 넘으면 실패로 본다. 넘기지 않으면 상한 없음 */
  timeout?: number;
}

/** git을 실행해 표준 출력을 돌려준다. 실패하면 던진다. */
export function git(cwd: string, args: string[], opts: GitOptions = {}): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    const child = execFile(
      'git',
      [...SAFE_CONFIG, '--no-pager', ...args],
      {
        cwd,
        maxBuffer: GIT_MAX_BUFFER,
        env: opts.env ? { ...process.env, ...opts.env } : process.env,
        ...(opts.timeout !== undefined ? { timeout: opts.timeout } : {}),
      },
      (error, stdout) => (error ? reject(error) : resolveOutput(stdout))
    );
    if (opts.input !== undefined) child.stdin?.end(opts.input);
    else child.stdin?.end();
  });
}

/** git을 실행해 표준 출력을 돌려준다. 실패하면 null — 실패를 어떻게 다룰지는 호출자가 정한다. */
export async function tryGit(
  cwd: string,
  args: string[],
  opts: GitOptions = {}
): Promise<string | null> {
  try {
    return await git(cwd, args, opts);
  } catch {
    return null;
  }
}

/** cwd가 git 저장소(작업 트리 또는 git 폴더) 안인가. */
export async function isGitRepo(cwd: string): Promise<boolean> {
  return (await tryGit(cwd, ['rev-parse', '--git-dir'])) !== null;
}
