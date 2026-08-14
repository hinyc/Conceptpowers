// @concept:concept-driven-tests @concept:governance-mode
import { z } from 'zod';

export const LocaleSchema = z.enum(['ko', 'en']);
export type Locale = z.infer<typeof LocaleSchema>;

// 커밋 게이트 강도(governance-mode 개념): strict=차단, standard=확인(기본), light=경고만.
// 설정이 없거나 깨졌으면 항상 standard로 동작한다(안전한 쪽).
export const EnforcementSchema = z.enum(['strict', 'standard', 'light']);
export type Enforcement = z.infer<typeof EnforcementSchema>;

export const InitConfigSchema = z.object({
  version: z.string(),
  enabled: z.literal(true),
  backfillMode: z.enum(['incremental', 'strict']).default('incremental'),
  enforceScope: z.literal('new-feature-behavior').default('new-feature-behavior'),
  locale: LocaleSchema.default('ko'),
  versionCheck: z.boolean().default(true),
  // 테스트 코드도 개념의 지배를 받는다 — 켜져 있으면(기본) 세션 시작 규칙에
  // "테스트 작성 전 대상 코드의 개념을 찾아 규칙 기반 시나리오를 도출하라"가 주입된다.
  conceptDrivenTests: z.boolean().default(true),
  enforcement: EnforcementSchema.default('standard'),
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
