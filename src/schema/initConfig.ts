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
  // 개념 매핑에서 제외할 경로 글롭(타입 전용·유틸·설정/빌드/생성물 등).
  // 여기에 매칭되는 파일은 @concept 태그가 없어도 커밋 게이트가 경고하지 않는다.
  ignoreGlobs: z.array(z.string()).default([
    'docs/conceptpowers/**',
    '**/*.d.ts', '**/*.types.ts', '**/types/**',
    '**/utils/**', '**/helpers/**',
    '**/*.config.*', 'scripts/**', 'dist/**', 'build/**',
    '**/*.generated.*'
  ]),
  project: z.object({ name: z.string().default(''), description: z.string().default('') }).default({})
})
export type InitConfig = z.infer<typeof InitConfigSchema>
export function parseInitConfig(input: unknown): InitConfig {
  return InitConfigSchema.parse(input)
}
