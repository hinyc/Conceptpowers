// @concept:plugin-version-sync
// src/init/ensureConfigDefaults.ts
// 새 플러그인 버전에서 생긴 설정 항목을 init.json에 기본값으로 보충한다.
// 사람이 적어둔 값과 도구가 모르는 항목은 그대로 두고 빠진 항목만 덧붙인다.
import { readFile } from 'node:fs/promises';
import { cpPaths } from '../paths.js';
import { parseInitConfig } from '../schema/initConfig.js';
import { writeFileAtomic } from '../util/atomicWrite.js';

// 채워 넣은 항목 이름들을 돌려준다(채운 것이 없으면 빈 배열).
// 파일이 없거나 읽을 수 없거나 검증을 통과하지 못하면 손대지 않는다 —
// 그 상태를 고치는 것은 init(또는 사용자)의 몫이다.
export async function ensureInitConfigDefaults(root: string): Promise<string[]> {
  const target = cpPaths(root).initFile;
  let current: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(await readFile(target, 'utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    current = parsed as Record<string, unknown>;
  } catch {
    return [];
  }

  let filled: Record<string, unknown>;
  try {
    filled = parseInitConfig(current) as unknown as Record<string, unknown>;
  } catch {
    return [];
  }

  const missing = Object.keys(filled).filter((key) => !(key in current));
  if (missing.length === 0) return []; // 채울 것이 없으면 파일을 다시 쓰지 않는다.

  const next = { ...current };
  for (const key of missing) next[key] = filled[key];
  try {
    await writeFileAtomic(target, JSON.stringify(next, null, 2) + '\n');
  } catch (error) {
    throw new Error(`init.json 설정 보충에 실패했습니다: ${(error as Error).message}`);
  }
  return missing;
}
