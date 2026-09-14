// @concept:reference-first-duty @concept:reference-privacy
// src/init/referenceWalk.ts
// 참고자료 폴더 트리를 훑는 공용 walker. "자료 있음" 판정(referencePaths)과 지문 목록
// 만들기(reference/enumerate)가 같은 건너뛰기 규칙을 쓰도록 한 곳에 둔다.
// 읽기만 한다 — 파일을 만들거나 고치지 않는다.
import { readdir, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';

// 한 폴더 트리를 훑는 상한. 이 수를 넘으면 거짓 경고 대신 "있음"으로 보고 멈춘다.
export const SCAN_LIMIT = 5000;

// done: 끝까지 훑음 · stopped: 방문자가 false를 돌려줘 멈춤 · capped: 상한 초과로 멈춤
// unreadable: 시작 폴더 자체를 읽지 못함(권한 없음·마운트 해제) — 안이 비었다는 뜻이 아니다
export type WalkOutcome = 'done' | 'stopped' | 'capped' | 'unreadable';

export interface UsableFileStat {
  size: number;
  mtime: string;
}

// 크기가 0인 파일은 자료로 치지 않는다(빈 placeholder가 "자료 있음" 오신호를 내지 않도록).
export async function statUsableFile(path: string): Promise<UsableFileStat | null> {
  try {
    const s = await stat(path);
    if (!s.isFile() || s.size === 0) return null;
    return { size: s.size, mtime: s.mtime.toISOString() };
  } catch {
    return null;
  }
}

export async function fileHasBytes(path: string): Promise<boolean> {
  return (await statUsableFile(path)) !== null;
}

// 폴더 트리의 자료 파일을 너비 우선으로 방문한다. 방문자는 stat 결과를 함께 받는다(재stat 방지).
// 점(.)으로 시작하는 이름은 건너뛴다 — .DS_Store·.git 같은 잡음이 자료가 되지 않도록.
// 심볼릭 링크는 Dirent.isDirectory()가 false라 재귀 대상이 아니다(순환 안전).
export async function walkUsableFiles(
  dir: string,
  visit: (abs: string, s: UsableFileStat) => boolean | Promise<boolean>,
  limit = SCAN_LIMIT
): Promise<WalkOutcome> {
  const queue: string[] = [dir];
  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift() as string;
    let entries: Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      if (current === dir) return 'unreadable';
      continue; // 읽을 수 없는 하위 폴더는 건너뛴다
    }
    for (const entry of entries) {
      if (++visited > limit) return 'capped';
      if (entry.name.startsWith('.')) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const s = await statUsableFile(full);
      if (s && !(await visit(full, s))) return 'stopped';
    }
  }
  return 'done';
}
