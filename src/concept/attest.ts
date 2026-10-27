// @concept:settled-status
// src/concept/attest.ts
// check-consistency 실행 증빙. 증빙은 에이전트의 자기신고이며, 목표는 "검사 단계를
// 건너뛴 채 승격/커밋이 진행되지 않게" 워크플로우를 강제하고 감사 흔적을 남기는 것이다.
import { cpPaths } from '../paths.js';
import { readJsonRecordStrict } from '../util/readJsonStrict.js';
import { AttestEntry, AttestLog } from '../schema/alignment.js';
import { writeFileAtomic } from '../util/atomicWrite.js';
import { contractHash } from '../drift/hash.js';
import type { Concept } from '../schema/concept.js';

// 읽기 판정용: 어떤 실패든 빈 기록(=증빙 없음)으로 본다. 증빙이 없으면 승격·커밋이 막히는 쪽이라 안전하다.
export async function readAttestLog(root: string): Promise<AttestLog> {
  try {
    return await readAttestLogStrict(root);
  } catch {
    return {};
  }
}

// 쓰기 경로용: 파일이 없을 때만 빈 기록. 깨진 파일(파싱·검증 실패)은 던져서
// 다른 개념의 증빙을 빈 값으로 덮어쓰지 않게 한다.
function readAttestLogStrict(root: string): Promise<AttestLog> {
  return readJsonRecordStrict(cpPaths(root).attestFile, AttestLog, '증빙 기록 파일');
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
  const next: AttestLog = { ...(await readAttestLogStrict(root)), [concept.slug]: entry };
  await writeFileAtomic(cpPaths(root).attestFile, JSON.stringify(next, null, 2) + '\n');
  return entry;
}

// 사라진 개념의 낡은 증빙을 지운다. 지운 slug를 돌려주고, 지울 것이 없으면 파일에 손대지 않는다.
export async function pruneAttestLog(
  root: string,
  liveSlugs: ReadonlySet<string>
): Promise<string[]> {
  const log = await readAttestLogStrict(root);
  const dead = Object.keys(log).filter((slug) => !liveSlugs.has(slug));
  if (dead.length === 0) return [];
  const next: AttestLog = Object.fromEntries(
    Object.entries(log).filter(([slug]) => liveSlugs.has(slug))
  );
  await writeFileAtomic(cpPaths(root).attestFile, JSON.stringify(next, null, 2) + '\n');
  return dead;
}

export function freshPassAttest(log: AttestLog, concept: Concept): boolean {
  const entry = log[concept.slug];
  return !!entry && entry.result === 'pass' && entry.hash === contractHash(concept);
}
