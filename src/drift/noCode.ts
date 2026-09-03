// @concept:drift-reconcile
// src/drift/noCode.ts
// 개념 수정이 코드 변경을 필요로 하지 않는다는 사람의 판단을 남기는 코드무관 기록.
// 문서만 커밋해도 문지기(driftGate)가 막지 않는 정식 통과 근거이며, 결산(reconcile)은
// 이 기록의 사유를 무시함(ignored) 이력에 함께 남긴다 — 검토 기록(test-review)과 같은 태도.
import { readFile } from 'node:fs/promises';
import { cpPaths } from '../paths.js';
import { NoCodeEntry, NoCodeLog } from '../schema/alignment.js';
import { writeFileAtomic } from '../util/atomicWrite.js';
import { contractHash } from './hash.js';
import type { Concept } from '../schema/concept.js';

export async function readNoCodeLog(root: string): Promise<NoCodeLog> {
  try {
    return NoCodeLog.parse(JSON.parse(await readFile(cpPaths(root).noCodeFile, 'utf8')));
  } catch {
    return {};
  }
}

export async function recordNoCode(
  root: string,
  concept: Concept,
  note: string
): Promise<NoCodeEntry> {
  // 스키마(zod)가 유일한 검문소: 빈 사유는 여기서 throw로 끝나고 기존 로그는 손대지 않는다.
  const entry: NoCodeEntry = NoCodeEntry.parse({
    hash: contractHash(concept),
    note,
    at: new Date().toISOString(),
  });
  const next: NoCodeLog = { ...(await readNoCodeLog(root)), [concept.slug]: entry };
  await writeFileAtomic(cpPaths(root).noCodeFile, JSON.stringify(next, null, 2) + '\n');
  return entry;
}

// 사라진 개념의 낡은 기록을 지운다. 증빙(attest)·검토 기록(test-review)과 같은 규칙이다.
export async function pruneNoCodeLog(
  root: string,
  liveSlugs: ReadonlySet<string>
): Promise<string[]> {
  const log = await readNoCodeLog(root);
  const dead = Object.keys(log).filter((slug) => !liveSlugs.has(slug));
  if (dead.length === 0) return [];
  const next: NoCodeLog = Object.fromEntries(
    Object.entries(log).filter(([slug]) => liveSlugs.has(slug))
  );
  await writeFileAtomic(cpPaths(root).noCodeFile, JSON.stringify(next, null, 2) + '\n');
  return dead;
}

// 지금의 개념 계약에 붙은 기록만 유효하다 — 개념을 다시 고치면 지난 기록은 효력을 잃는다.
// 문지기·결산은 개념 전체가 아니라 DriftItem의 현재 지문만 들고 있으므로 해시로 받는다.
export function freshNoCode(log: NoCodeLog, slug: string, currentHash: string): boolean {
  const entry = log[slug];
  return !!entry && entry.hash === currentHash;
}
