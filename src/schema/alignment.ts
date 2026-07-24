import { z } from 'zod';

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
});
export type AttestEntry = z.infer<typeof AttestEntry>;

export const AttestLog = z.record(z.string(), AttestEntry);
export type AttestLog = z.infer<typeof AttestLog>;
