// @concept:none
// src/store/walkJson.ts — 폴더 아래 .json 파일을 하위 폴더까지 모두 찾는 도구(개념·기능 저장소 공용).
import { readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';

// 폴더가 없거나 읽을 수 없으면 빈 목록 — 아직 아무것도 쓰지 않은 프로젝트를 정상으로 본다.
export async function walkJson(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkJson(full)));
    else if (e.name.endsWith('.json')) out.push(full);
  }
  return out;
}
