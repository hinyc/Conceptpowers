// @concept:none
// src/util/readJsonStrict.ts
// 기록 파일(증빙·충돌 사유 등)을 쓰기 전에 읽는 엄격 판독 — 파일이 없을 때만 빈 기록({})이다.
// 깨진 파일(파싱·검증 실패)은 던져서, 다른 항목을 빈 값으로 덮어쓰지 않게 한다.
import { readFile } from 'node:fs/promises';
import type { z } from 'zod';

/**
 * file을 읽어 schema로 검증한다. 파일이 없으면 빈 기록, 그 밖의 읽기 실패는 그대로 던지고,
 * 파싱·검증 실패는 `${label}이 깨져 있어 쓰지 않았습니다 (file): 원인` 으로 던진다.
 */
export async function readJsonRecordStrict<T extends Record<string, unknown>>(
  file: string,
  schema: z.ZodType<T>,
  label: string
): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {} as T;
    throw error;
  }
  try {
    return schema.parse(JSON.parse(raw));
  } catch (error) {
    throw new Error(`${label}이 깨져 있어 쓰지 않았습니다 (${file}): ${(error as Error).message}`);
  }
}
