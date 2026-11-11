// @concept:output-locale
// src/init/readConfig.ts
import { readFile } from 'node:fs/promises';
import { cpPaths } from '../paths.js';
import {
  LEGACY_LOCALE,
  LocaleSchema,
  parseInitConfig,
  type InitConfig,
  type Locale,
} from '../schema/initConfig.js';

// init.json을 읽어 검증한다. 파일이 없거나 파싱/검증에 실패하면 null.
export async function readInitConfig(root: string): Promise<InitConfig | null> {
  try {
    const raw = await readFile(cpPaths(root).initFile, 'utf8');
    return parseInitConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

// 사람이 보는 출력 언어를 정하는 유일한 곳(output-locale). locale 키만 따로 느슨하게 읽는다 —
// 다른 키가 잘못돼 전체 검증이 실패해도 적힌 언어는 그대로 따른다(도구가 스스로 언어를 바꾸지 않는다).
// ko 폴백(LEGACY_LOCALE)은 locale 키가 없는 기존 프로젝트, 파일 없음·JSON 깨짐, 값 자체가 무효일 때만 쓴다.
export async function readProjectLocale(root: string): Promise<Locale> {
  try {
    const raw: unknown = JSON.parse(await readFile(cpPaths(root).initFile, 'utf8'));
    const parsed = LocaleSchema.safeParse((raw as { locale?: unknown } | null)?.locale);
    return parsed.success ? parsed.data : LEGACY_LOCALE;
  } catch {
    return LEGACY_LOCALE;
  }
}
