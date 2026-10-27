// @concept:init-gate
// src/hooks/hookRoot.ts
// 훅이 검사할 프로젝트 루트. 프로세스 작업 폴더가 하위 폴더이면 그대로 쓸 때 초기화 표시를 못 찾아 거버넌스가
// 조용히 꺼진다 — 훅 입력의 작업 폴더(cwd), 프로젝트 폴더 환경 변수(CLAUDE_PROJECT_DIR), 프로세스 작업 폴더
// 순으로 위로 올라가며 초기화 표시(init.json)가 있는 폴더를 찾는다. 어디서도 찾지 못하면 프로세스 작업 폴더다.
import { dirname, resolve } from 'node:path';
import { isInitialized } from '../init/scaffold.js';

export interface HookRootSources {
  /** 훅 입력(payload)의 작업 폴더 */
  cwd?: unknown;
  env: Record<string, string | undefined>;
  processCwd: string;
}

async function initializedAncestor(start: string): Promise<string | null> {
  let current = resolve(start);
  for (;;) {
    if (await isInitialized(current)) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export async function findHookRoot(src: HookRootSources): Promise<string> {
  const starts = [src.cwd, src.env.CLAUDE_PROJECT_DIR, src.processCwd].filter(
    (s): s is string => typeof s === 'string' && s.length > 0
  );
  for (const start of starts) {
    const found = await initializedAncestor(start);
    if (found) return found;
  }
  return src.processCwd;
}

/** 훅 진입점용: 실제 환경에서 루트를 찾는다. */
export const hookRootOf = (payloadCwd?: unknown): Promise<string> =>
  findHookRoot({ cwd: payloadCwd, env: process.env, processCwd: process.cwd() });
