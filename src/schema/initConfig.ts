import { z } from 'zod';

export const LocaleSchema = z.enum(['ko', 'en']);
export type Locale = z.infer<typeof LocaleSchema>;

export const InitConfigSchema = z.object({
  version: z.string(),
  enabled: z.literal(true),
  backfillMode: z.enum(['incremental', 'strict']).default('incremental'),
  enforceScope: z.literal('new-feature-behavior').default('new-feature-behavior'),
  locale: LocaleSchema.default('ko'),
  versionCheck: z.boolean().default(true),
  // 커밋 게이트가 @concept 마커를 강제하지 않는 경로 글롭 — **재생성물·외부 코드만** 자동 제외한다.
  // 손으로 쓴 코드(utils/types/config/scripts 포함)는 예외 없이 마커가 있어야 하며,
  // 개념이 없으면 `@concept:none`을 명시한다(조용히 건너뛰지 않는다).
  ignoreGlobs: z.array(z.string()).default([
    'docs/conceptpowers/**', // 플러그인 생성물(뷰어 등)
    'dist/**',
    'build/**', // 빌드 산출물
    'node_modules/**', // 외부 의존성
    '**/*.generated.*', // 코드 생성물
  ]),
  project: z
    .object({ name: z.string().default(''), description: z.string().default('') })
    .default({}),
});
export type InitConfig = z.infer<typeof InitConfigSchema>;
export function parseInitConfig(input: unknown): InitConfig {
  return InitConfigSchema.parse(input);
}
