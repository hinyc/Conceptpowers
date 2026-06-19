import { z } from 'zod'

export const LockEntry = z.object({ hash: z.string(), at: z.string() })
export const AlignmentLock = z.record(z.string(), LockEntry)
export type AlignmentLock = z.infer<typeof AlignmentLock>

export const HistoryEntry = z.object({
  slug: z.string(),
  hash: z.string(),
  prevHash: z.string().default(''),
  reason: z.string().max(1000).default(''),
  at: z.string(),
  ignored: z.boolean().default(false),
})
export type HistoryEntry = z.infer<typeof HistoryEntry>

export const History = z.array(HistoryEntry)
export type History = z.infer<typeof History>
