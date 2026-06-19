import { z } from 'zod'

export const LocaleSchema = z.enum(['ko', 'en'])
export type Locale = z.infer<typeof LocaleSchema>

export const InitConfigSchema = z.object({
  version: z.string(),
  enabled: z.literal(true),
  backfillMode: z.enum(['incremental', 'strict']).default('incremental'),
  enforceScope: z.literal('new-feature-behavior').default('new-feature-behavior'),
  locale: LocaleSchema.default('ko'),
  versionCheck: z.boolean().default(true),
  project: z.object({ name: z.string().default(''), description: z.string().default('') }).default({})
})
export type InitConfig = z.infer<typeof InitConfigSchema>
export function parseInitConfig(input: unknown): InitConfig {
  return InitConfigSchema.parse(input)
}
