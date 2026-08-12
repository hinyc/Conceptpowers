// @concept:settled-status
// src/concept/attest.ts
// check-consistency 실행 증빙. 증빙은 에이전트의 자기신고이며, 목표는 "검사 단계를
// 건너뛴 채 승격/커밋이 진행되지 않게" 워크플로우를 강제하고 감사 흔적을 남기는 것이다.
import { readFile } from 'node:fs/promises';
import { cpPaths } from '../paths.js';
import { AttestEntry, AttestLog } from '../schema/alignment.js';
import { writeFileAtomic } from '../util/atomicWrite.js';
import { contractHash } from '../drift/hash.js';
import type { Concept } from '../schema/concept.js';

export async function readAttestLog(root: string): Promise<AttestLog> {
  try {
    return AttestLog.parse(JSON.parse(await readFile(cpPaths(root).attestFile, 'utf8')));
  } catch {
    return {};
  }
}

export interface AttestEvidence {
  compared?: string[];
  note?: string;
}

export async function recordAttest(
  root: string,
  concept: Concept,
  result: 'pass' | 'conflict',
  evidence: AttestEvidence = {}
): Promise<AttestEntry> {
  // 스키마(zod)가 유일한 검문소: 여기서 검증해 통과한 값만 파일에 쓴다.
  // 검증 실패 시 throw로 끝나야 하며, 기존 로그 파일에는 절대 손대지 않는다
  // (검증 없이 쓰면 다음 readAttestLog가 파싱 실패 → {} 폴백 → 다음 recordAttest가
  // 로그 전체를 단일 엔트리로 덮어써 과거 증빙을 파괴한다 — data loss).
  const entry: AttestEntry = AttestEntry.parse({
    hash: contractHash(concept),
    result,
    at: new Date().toISOString(),
    ...(evidence.compared && evidence.compared.length > 0 ? { compared: evidence.compared } : {}),
    ...(evidence.note ? { note: evidence.note } : {}),
  });
  const next: AttestLog = { ...(await readAttestLog(root)), [concept.slug]: entry };
  await writeFileAtomic(cpPaths(root).attestFile, JSON.stringify(next, null, 2) + '\n');
  return entry;
}

export function freshPassAttest(log: AttestLog, concept: Concept): boolean {
  const entry = log[concept.slug];
  return !!entry && entry.result === 'pass' && entry.hash === contractHash(concept);
}
