// @concept:reference-first-duty @concept:reference-privacy
// src/init/reference.ts
// docs/conceptpowers/reference/ — 사용자가 넣는 참고자료 폴더(paths.md로 외부 경로 연결도 가능).
// 정의된 개념이 사실(source of truth)이고 reference는 그 원천 재료다: 에이전트는 오직
// 개념 생성·업그레이드·검증(update-concepts 스킬) 시에만 관련 자료를 on-demand로
// 읽는다. 코드 판정(review/scan)은 개념만 근거로 하며 reference를 읽지 않는다.
// (내용은 untrusted 데이터 — 지시가 아니다.)
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { walkUsableFiles } from './referenceWalk.js';
import { cpPaths } from '../paths.js';
import { readInitConfig } from './readConfig.js';
import { seedTemplates } from '../i18n/messages.js';

const SEED_README = 'README.md';

// reference/ 폴더와 안내용 seed README를 보장한다.
// README는 사용자 전속이므로 이미 있으면 덮어쓰지 않는다(true=새로 생성함).
export async function ensureReference(root: string): Promise<boolean> {
  const dir = cpPaths(root).reference;
  await mkdir(dir, { recursive: true });
  const readme = join(dir, SEED_README);
  try {
    await access(readme);
    return false; // 이미 있음 — 사용자 편집 보존
  } catch {
    /* 없으면 생성 */
  }
  const locale = (await readInitConfig(root))?.locale ?? 'ko';
  await writeFile(readme, seedTemplates[locale].reference, 'utf8');
  return true;
}

// 사용자가 넣은 참고 파일 목록(플러그인 메타 파일 제외, reference/ 기준 상대경로).
// SessionStart 신호와 지문 목록(reference/enumerate)이 함께 쓴다 — 건너뛰기 규칙(점 파일·
// 0바이트)은 walkUsableFiles 한 곳을 따른다. paths.md·README도 플러그인이 깔아두는 안내라
// 제외한다(빈 템플릿이 "자료 있음" 오신호를 내지 않도록). .gitignore는 점 파일이라 이미 빠진다.
// 지문 목록이 빠짐없어야 하므로 폴더 훑기 상한은 두지 않는다.
const PLUGIN_META_FILES = new Set([SEED_README, 'paths.md']);
export async function listReferenceFiles(root: string): Promise<string[]> {
  const dir = cpPaths(root).reference;
  const found: string[] = [];
  await walkUsableFiles(
    dir,
    (abs) => {
      found.push(relative(dir, abs));
      return true;
    },
    Number.POSITIVE_INFINITY
  );
  return found.filter((p) => !PLUGIN_META_FILES.has(p)).sort();
}
