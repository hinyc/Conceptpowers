// @concept:concept-driven-tests
// src/concept/testReview.ts
// 개념이 바뀔 때 그에 딸린 검사를 어떻게 처리했는지 남기는 검토 기록.
// 기록은 에이전트의 자기신고이며, 목표는 "검사를 되돌아보는 단계를 건너뛴 채 커밋이 진행되지
// 않게" 워크플로우를 강제하고 감사 흔적을 남기는 것이다(증빙 attest와 같은 태도).
import { readFile } from 'node:fs/promises';
import { cpPaths } from '../paths.js';
import { TestReviewEntry, TestReviewLog } from '../schema/alignment.js';
import { writeFileAtomic } from '../util/atomicWrite.js';
import { contractHash } from '../drift/hash.js';
import type { Concept } from '../schema/concept.js';

export type TestReviewResult = TestReviewEntry['result'];

export async function readTestReviewLog(root: string): Promise<TestReviewLog> {
  try {
    return TestReviewLog.parse(JSON.parse(await readFile(cpPaths(root).testReviewFile, 'utf8')));
  } catch {
    return {};
  }
}

export interface TestReviewEvidence {
  tests?: string[];
  note?: string;
}

export async function recordTestReview(
  root: string,
  concept: Concept,
  result: TestReviewResult,
  evidence: TestReviewEvidence = {}
): Promise<TestReviewEntry> {
  // 스키마(zod)가 유일한 검문소: 검증을 통과한 값만 파일에 쓴다. 검증 실패는 throw로 끝나고
  // 기존 로그 파일에는 손대지 않는다 — 깨진 파일을 남기면 다음 읽기가 {}로 폴백해 과거 기록이
  // 통째로 사라진다(attest와 동일한 방어).
  const entry: TestReviewEntry = TestReviewEntry.parse({
    hash: contractHash(concept),
    result,
    at: new Date().toISOString(),
    ...(evidence.tests && evidence.tests.length > 0 ? { tests: evidence.tests } : {}),
    ...(evidence.note ? { note: evidence.note } : {}),
  });
  const next: TestReviewLog = { ...(await readTestReviewLog(root)), [concept.slug]: entry };
  await writeFileAtomic(cpPaths(root).testReviewFile, JSON.stringify(next, null, 2) + '\n');
  return entry;
}

// 지금의 개념 계약에 붙은 기록만 유효하다 — 개념을 다시 고치면 지난 기록은 효력을 잃는다.
export function freshTestReview(log: TestReviewLog, concept: Concept): boolean {
  const entry = log[concept.slug];
  return !!entry && entry.hash === contractHash(concept);
}
