// @concept:settled-status
// src/concept/attest.ts
// check-consistency 실행 증빙. 증빙은 에이전트의 자기신고이며, 목표는 "검사 단계를
// 건너뛴 채 승격/커밋이 진행되지 않게" 워크플로우를 강제하고 감사 흔적을 남기는 것이다.
import { readFile } from 'node:fs/promises'
import { cpPaths } from '../paths.js'
import { AttestLog, type AttestEntry } from '../schema/alignment.js'
import { writeFileAtomic } from '../util/atomicWrite.js'
import { contractHash } from '../drift/hash.js'
import type { Concept } from '../schema/concept.js'

export async function readAttestLog(root: string): Promise<AttestLog> {
  try {
    return AttestLog.parse(JSON.parse(await readFile(cpPaths(root).attestFile, 'utf8')))
  } catch {
    return {}
  }
}

export async function recordAttest(
  root: string,
  concept: Concept,
  result: 'pass' | 'conflict',
): Promise<AttestEntry> {
  const entry: AttestEntry = {
    hash: contractHash(concept),
    result,
    at: new Date().toISOString(),
  }
  const next: AttestLog = { ...(await readAttestLog(root)), [concept.slug]: entry }
  await writeFileAtomic(cpPaths(root).attestFile, JSON.stringify(next, null, 2) + '\n')
  return entry
}

export function freshPassAttest(log: AttestLog, concept: Concept): boolean {
  const entry = log[concept.slug]
  return !!entry && entry.result === 'pass' && entry.hash === contractHash(concept)
}
