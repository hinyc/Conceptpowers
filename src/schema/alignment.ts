// @concept:drift-reconcile @concept:concept-driven-tests @concept:reference-sync
import { z } from 'zod';

// 참고자료 기준점: 파일마다 지문(내용 해시)·크기·수정 시각만 남긴다 — 내용은 절대 담지 않는다.
// 열쇠는 저장소 안 파일이면 저장소 상대 경로, 등록 폴더 안 파일이면 "등록 경로/상대 경로".
export const ReferenceLockEntry = z.object({
  hash: z.string(), // sha256 앞 12 hex
  size: z.number().int().nonnegative(),
  mtime: z.string(), // ISO
});
export type ReferenceLockEntry = z.infer<typeof ReferenceLockEntry>;

export const ReferenceLock = z.object({
  version: z.literal(1).default(1),
  at: z.string(),
  files: z.record(z.string(), ReferenceLockEntry).default({}),
  // 상한에 걸려 일부만 훑은 등록 경로(paths.md에 적힌 그대로)
  truncated: z.array(z.string()).default([]),
});
export type ReferenceLock = z.infer<typeof ReferenceLock>;

export const LockEntry = z.object({ hash: z.string(), at: z.string() });
export const AlignmentLock = z.record(z.string(), LockEntry);
export type AlignmentLock = z.infer<typeof AlignmentLock>;

export const HistoryEntry = z.object({
  slug: z.string(),
  hash: z.string(),
  prevHash: z.string().default(''),
  reason: z.string().max(1000).default(''),
  at: z.string(),
  ignored: z.boolean().default(false),
  aligned: z.boolean().default(false),
  // 코드무관 기록이 있는 무시함: 사유가 남은 정당한 예외를 설명 없는 강행과 구분한다.
  noCode: z.boolean().default(false),
  note: z.string().max(1000).default(''),
});
export type HistoryEntry = z.infer<typeof HistoryEntry>;

export const History = z.array(HistoryEntry);
export type History = z.infer<typeof History>;

// 충돌 검사 증빙: check-consistency 실행 결과를 계약 해시에 묶어 기록한다.
// 해시가 현재 개념과 다르면 증빙은 자동 실효(신선도 보장).
export const AttestEntry = z.object({
  hash: z.string(),
  result: z.enum(['pass', 'conflict']),
  at: z.string(),
  compared: z.array(z.string()).optional(), // check-consistency에서 비교한 대상 slug 목록
  note: z.string().max(1000).optional(), // 판단 요약
});
export type AttestEntry = z.infer<typeof AttestEntry>;

export const AttestLog = z.record(z.string(), AttestEntry);
export type AttestLog = z.infer<typeof AttestLog>;

// 테스트 검토 기록: 개념이 바뀔 때 그에 딸린 검사를 어떻게 처리했는지 계약 해시에 묶어 남긴다.
// 해시가 현재 개념과 다르면 기록은 자동 실효(신선도 보장) — 증빙(AttestEntry)과 같은 규칙이다.
//  - updated  : 검사를 함께 고쳤다
//  - no-impact: 검사를 고칠 필요가 없다(사유 필수 권장)
//  - no-tests : 이 개념에 딸린 검사가 아직 없다
export const TestReviewEntry = z.object({
  hash: z.string(),
  result: z.enum(['updated', 'no-impact', 'no-tests']),
  at: z.string(),
  tests: z.array(z.string()).optional(), // 검토·수정한 검사 파일 경로
  note: z.string().max(1000).optional(), // 판단 요약
});
export type TestReviewEntry = z.infer<typeof TestReviewEntry>;

export const TestReviewLog = z.record(z.string(), TestReviewEntry);
export type TestReviewLog = z.infer<typeof TestReviewLog>;

// 코드무관 기록: 개념 수정이 코드 변경을 필요로 하지 않는다는 사람의 판단을 계약 해시에 묶어
// 남긴다. 해시가 현재 개념과 다르면 자동 실효(신선도 보장) — 증빙(AttestEntry)과 같은 규칙이다.
// 사유(note)는 비울 수 없다 — 기록의 목적이 사유 보존이다.
export const NoCodeEntry = z.object({
  hash: z.string(),
  note: z.string().min(1).max(1000),
  at: z.string(),
});
export type NoCodeEntry = z.infer<typeof NoCodeEntry>;

export const NoCodeLog = z.record(z.string(), NoCodeEntry);
export type NoCodeLog = z.infer<typeof NoCodeLog>;
