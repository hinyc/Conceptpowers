import { z } from 'zod'

export const LocaleSchema = z.enum(['ko', 'en'])
export type Locale = z.infer<typeof LocaleSchema>

// 승인 모드: manual = 사용자가 JSON status를 직접 수정(에이전트 자동승인 차단, 기본),
// cli = approve 명령/스킬로 일관성 검사 후 승인 허용.
export const ApprovalModeSchema = z.enum(['manual', 'cli'])
export type ApprovalMode = z.infer<typeof ApprovalModeSchema>

export const InitConfigSchema = z.object({
  version: z.string(),
  enabled: z.literal(true),
  backfillMode: z.enum(['incremental', 'strict']).default('incremental'),
  enforceScope: z.literal('new-feature-behavior').default('new-feature-behavior'),
  locale: LocaleSchema.default('ko'),
  approvalMode: ApprovalModeSchema.default('manual'),
  project: z.object({ name: z.string().default(''), description: z.string().default('') }).default({})
})
export type InitConfig = z.infer<typeof InitConfigSchema>
export function parseInitConfig(input: unknown): InitConfig {
  return InitConfigSchema.parse(input)
}
