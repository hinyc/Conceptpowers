// @concept:reference-first-duty @concept:reference-privacy @concept:output-locale
// src/init/referencePaths.ts
// reference/paths.md — 사용자가 등록한 외부 참고자료 경로 목록(여러 개, 절대/상대, 파일/폴더).
// 여기서는 그 목록을 파싱·검증만 한다(내용은 읽지 않는다 — 내용 읽기는 개념 정의 시점의
// 에이전트 몫). 검증 결과는 세션 시작 알림과 `reference-add` CLI가 사용한다.
import { readFile, stat, access, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { cpPaths } from '../paths.js';
import { walkUsableFiles } from './referenceWalk.js';
import { readInitConfig } from './readConfig.js';
import { LEGACY_LOCALE } from '../schema/initConfig.js';
import { seedTemplates } from '../i18n/messages.js';

export type ReferencePathStatus = 'ok' | 'missing' | 'empty';
export interface ReferencePathCheck {
  raw: string;
  resolved: string;
  status: ReferencePathStatus;
}

export const PATHS_FILE = 'paths.md';

// reference/paths.md 템플릿을 보장한다(없을 때만 생성 — 사용자 편집 보존).
// paths.md는 gitignore 화이트리스트라 커밋 가능하다. 생성했으면 true.
export async function ensureReferencePaths(root: string): Promise<boolean> {
  const dir = cpPaths(root).reference;
  const target = join(dir, PATHS_FILE);
  try {
    await access(target);
    return false; // 이미 있음 — 사용자 편집 보존
  } catch {
    /* 없으면 생성 */
  }
  await mkdir(dir, { recursive: true });
  // 안내 템플릿은 사람이 읽는 산출물이라 프로젝트 설정 언어로 쓴다(output-locale).
  const locale = (await readInitConfig(root))?.locale ?? LEGACY_LOCALE;
  await writeFile(target, seedTemplates[locale].referencePaths, 'utf8');
  return true;
}

// 한 줄 하나(불릿 `-`/`*` 허용). 빈 줄과 `#` 시작 줄(제목·주석)은 무시.
export function parseReferencePaths(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter((line) => line !== '');
}

// `~/` → 홈 디렉터리, 절대 경로는 그대로, 나머지는 저장소 루트 기준.
export function resolveReferencePath(root: string, raw: string): string {
  if (raw === '~' || raw.startsWith('~/')) return join(homedir(), raw.slice(1));
  if (isAbsolute(raw)) return raw;
  return join(root, raw);
}

// 폴더 트리에 실제로 읽을 자료가 하나라도 있는지 확인한다(첫 자료를 찾는 즉시 중단).
// 건너뛰기 규칙(점 이름·0바이트·심볼릭 링크)은 공용 walker가 맡는다.
// 상한 초과(capped)는 보수적으로 "자료 있음"으로 본다 — 거짓 경고를 내지 않기 위해서다.
async function dirHasUsableContent(dir: string): Promise<boolean> {
  return (await walkUsableFiles(dir, () => false)) !== 'done';
}

// 등록된 각 경로의 상태: ok(내용 있는 파일/자료 있는 폴더) · empty(읽을 자료 없음) · missing(없음).
// empty는 "폴더에 항목이 없음"이 아니라 "참고할 자료가 없음" 기준이다 — 빈 하위 폴더만 있거나
// 점 파일·0바이트 파일뿐인 경로도 empty로 잡아 사용자에게 경고한다.
export async function checkReferencePaths(root: string): Promise<ReferencePathCheck[]> {
  let content: string;
  try {
    content = await readFile(join(cpPaths(root).reference, PATHS_FILE), 'utf8');
  } catch {
    return [];
  }
  const out: ReferencePathCheck[] = [];
  for (const raw of parseReferencePaths(content)) {
    const resolved = resolveReferencePath(root, raw);
    let status: ReferencePathStatus;
    try {
      const s = await stat(resolved);
      const usable = s.isDirectory() ? await dirHasUsableContent(resolved) : s.size > 0;
      status = usable ? 'ok' : 'empty';
    } catch {
      status = 'missing';
    }
    out.push({ raw, resolved, status });
  }
  return out;
}
