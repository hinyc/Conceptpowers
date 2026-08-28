// @concept:reference-first-duty @concept:reference-privacy
// src/init/addReferencePath.ts
// reference/paths.md에 외부 참고자료 경로를 등록한다(추가 전용 — 삭제/수정은 사용자가 직접 편집).
// 기존 내용과 주석은 그대로 두고 끝에 덧붙이며, 경로의 내용은 읽지 않는다(읽기는 개념 정의 시점의
// 에이전트 몫). 존재하지 않는 경로도 거부하지 않고 기록한다 — 아직 만들지 않은 폴더를 미리
// 등록하는 경우를 막지 않기 위해서다. 경고는 checkReferencePaths의 status로 전달된다.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cpPaths } from '../paths.js';
import { writeFileAtomic } from '../util/atomicWrite.js';
import {
  PATHS_FILE,
  ensureReferencePaths,
  parseReferencePaths,
  resolveReferencePath,
} from './referencePaths.js';

export type SkipReason = 'duplicate' | 'invalid';
export interface SkippedEntry {
  raw: string;
  reason: SkipReason;
}
export interface AddReferencePathResult {
  added: string[]; // 정규화되어 실제로 기록된 경로
  skipped: SkippedEntry[];
}

// 입력 정규화: 앞뒤 공백 → 불릿(-, *) → 감싼 따옴표 제거.
// 파일 탐색기 드래그·셸 복사로 들어오는 따옴표 감싼 경로를 그대로 받을 수 있게 한다.
// `~`는 보존한다(홈 위치가 바뀌어도 유효한 표기).
export function normalizeEntry(raw: string): string {
  const trimmed = raw
    .trim()
    .replace(/^[-*]\s+/, '')
    .trim();
  const quoted = /^(['"])(.*)\1$/.exec(trimmed);
  return (quoted ? quoted[2] : trimmed).trim();
}

// 경로를 paths.md에 등록한다. 중복은 resolve 결과로 판정해 `~/x`와 절대경로를 같은 항목으로 본다.
export async function addReferencePath(
  root: string,
  raws: string[]
): Promise<AddReferencePathResult> {
  await ensureReferencePaths(root); // 없으면 안내 템플릿부터 깔고 그 뒤에 덧붙인다
  const target = join(cpPaths(root).reference, PATHS_FILE);
  let existing: string;
  try {
    existing = await readFile(target, 'utf8');
  } catch (error) {
    throw new Error(
      `참고자료 경로 파일을 읽지 못했습니다 (${target}): ${(error as Error).message}`
    );
  }

  const registered = new Set(
    parseReferencePaths(existing).map((entry) => resolveReferencePath(root, entry))
  );
  const added: string[] = [];
  const skipped: SkippedEntry[] = [];
  for (const raw of raws) {
    const entry = normalizeEntry(raw);
    if (entry === '' || entry.startsWith('#')) {
      skipped.push({ raw, reason: 'invalid' });
      continue;
    }
    const resolved = resolveReferencePath(root, entry);
    if (registered.has(resolved)) {
      skipped.push({ raw, reason: 'duplicate' }); // 같은 호출 안의 중복도 여기서 걸린다
      continue;
    }
    registered.add(resolved);
    added.push(entry);
  }

  if (added.length > 0) {
    // 마지막 줄이 개행으로 끝나지 않으면 기존 줄에 붙어버리므로 개행을 먼저 보정한다.
    const base = existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`;
    try {
      await writeFileAtomic(target, `${base}${added.map((entry) => `- ${entry}`).join('\n')}\n`);
    } catch (error) {
      throw new Error(
        `참고자료 경로를 기록하지 못했습니다 (${target}): ${(error as Error).message}`
      );
    }
  }
  return { added, skipped };
}
