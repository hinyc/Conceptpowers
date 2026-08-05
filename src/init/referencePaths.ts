// @concept:reference-first-duty @concept:reference-privacy
// src/init/referencePaths.ts
// reference/paths.md — 사용자가 등록한 외부 참고자료 경로 목록(여러 개, 절대/상대, 파일/폴더).
// 여기서는 그 목록을 파싱·검증만 한다(내용은 읽지 않는다 — 내용 읽기는 개념 정의 시점의
// 에이전트 몫). 검증 결과는 세션 시작 알림과 `reference` CLI가 사용한다.
import { readFile, readdir, stat, access, mkdir, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { cpPaths } from '../paths.js';

export type ReferencePathStatus = 'ok' | 'missing' | 'empty';
export interface ReferencePathCheck {
  raw: string;
  resolved: string;
  status: ReferencePathStatus;
}

export const PATHS_FILE = 'paths.md';

// init 시 reference/paths.md에 깔아두는 안내 템플릿(영어 주석).
// 모든 줄이 주석(#)/빈 줄이라 parseReferencePaths는 빈 목록을 반환한다 —
// 사용자가 실제 경로를 넣기 전까지 "경로 없음" 경고를 내지 않는다.
export const PATHS_TEMPLATE = [
  '# Reference paths — external documents to consult when authoring concepts.',
  '#',
  '# List one path per line. Lines starting with "#" are comments and are ignored,',
  '# so this file registers nothing until you add real (uncommented) entries.',
  '#',
  '# These are read ONLY while defining, upgrading, or verifying a concept',
  '# (define-concept / check-consistency) — never during ordinary code checks.',
  '# Point them at domain glossaries, specs, contracts, planning docs, and so on.',
  '#',
  '# Accepted forms:',
  '#   ~/Documents/domain-glossary/     home-relative folder (all files inside)',
  '#   /Users/me/specs/auth.md          absolute file',
  '#   docs/legal/contract.pdf          repo-relative path',
  '#',
  '# Or skip the editing: run /conceptpowers:add-reference and give it the path — it appends the',
  '# entry here and warns if the location holds no readable material.',
  '#',
  '# Uncomment and edit the examples below, or add your own:',
  '#   ~/work/product-specs/',
  '#   /absolute/path/to/domain-rules.md',
  '',
].join('\n');

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
  await writeFile(target, PATHS_TEMPLATE, 'utf8');
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

// 한 폴더 트리를 훑는 상한. 이 수를 넘도록 자료를 못 찾으면 거짓 경고 대신 "있음"으로 본다.
const SCAN_LIMIT = 5000;

// 크기가 0인 파일은 자료로 치지 않는다(빈 placeholder가 "자료 있음" 오신호를 내지 않도록).
async function fileHasBytes(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

// 폴더 트리에 실제로 읽을 자료가 하나라도 있는지 확인한다(첫 자료를 찾는 즉시 중단).
// 점(.)으로 시작하는 이름은 건너뛴다 — .DS_Store·.git 같은 잡음이 "자료 있음"이 되지 않도록.
// 심볼릭 링크는 Dirent.isDirectory()가 false라 재귀 대상이 아니다(순환 안전).
async function dirHasUsableContent(dir: string): Promise<boolean> {
  const queue: string[] = [dir];
  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift() as string;
    let entries: Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue; // 읽을 수 없는 하위 폴더는 건너뛴다
    }
    for (const entry of entries) {
      if (++visited > SCAN_LIMIT) return true; // 상한 초과 — 보수적으로 자료 있음
      if (entry.name.startsWith('.')) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(full);
      } else if (entry.isFile() && (await fileHasBytes(full))) {
        return true;
      }
    }
  }
  return false;
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
