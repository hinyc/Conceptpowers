// @concept:governance-mode
// src/hooks/command/commitFiles.ts
// 커밋 계획(범위)에 따라 실제로 커밋될 파일 목록을 돌려준다. 목록은 커밋될 트리를 미리 만들어 git에게서 받는다
// (commitTree). 계산하지 못하면 빈 목록으로 삼키지 않고 던진다 — "검사할 파일 없음 = 통과"가 되지 않도록.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { snapshotCommit, type CommitTarget } from './commitTree.js';

export type { CommitTarget } from './commitTree.js';

const execFileAsync = promisify(execFile);

// 커밋에 들어갈 추가·수정 파일(이름 바꾸기는 새 경로의 추가) — 문지기 검사의 대상.
export async function resolveCommitFiles(root: string, plan: CommitTarget): Promise<string[]> {
  return (await snapshotCommit(root, plan)).files;
}

// 커밋으로 삭제되는 파일(이름 바꾸기는 옛 경로의 삭제) — 거버넌스 파일 삭제 확인에 쓴다.
export async function resolveDeletedFiles(root: string, plan: CommitTarget): Promise<string[]> {
  return (await snapshotCommit(root, plan)).deleted;
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
