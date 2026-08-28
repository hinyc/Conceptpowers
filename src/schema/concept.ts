// @concept:globally-unique-slug @concept:viewer-readability @concept:concept-aliases @concept:concept-scope
import { z } from 'zod';

export const ConceptCategory = z.enum(['feature', 'behavior', 'role', 'permission', 'term']);
export type ConceptCategory = z.infer<typeof ConceptCategory>;

// 'none'은 `@concept:none`(개념 없음 명시) 예약 마커라 실제 개념 slug로 쓸 수 없다.
const RESERVED_SLUGS = new Set(['constructor', 'prototype', '__proto__', 'none']);
const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be kebab-case')
  .refine((s) => !RESERVED_SLUGS.has(s), 'slug must not be a reserved name');

// 승인 상태: green = 검증된 source of truth, pending = 사용자 작성·정착 전(미적용),
// red = 미승인(자동추론 기본/거부). 기본값은 red(특권 상태 pending은 명시 지정만).
export const ConceptStatus = z.enum(['green', 'pending', 'red']);
export type ConceptStatus = z.infer<typeof ConceptStatus>;

export const ConceptSchema = z.object({
  slug,
  group: z
    .string()
    .regex(/^([a-z0-9]+(-[a-z0-9]+)*)(\/[a-z0-9]+(-[a-z0-9]+)*)*$/)
    .or(z.literal(''))
    .default(''),
  category: z.array(ConceptCategory).min(1, 'category must have at least one item'),
  number: z.number().int().positive().optional(),
  status: ConceptStatus.default('red'),
  title: z.string().min(1),
  // 같은 개념을 부르는 다른 이름들. 찾아오는 데에만 쓰이고 개념을 가리키는 열쇠는
  // 언제나 slug다 — 없어도 개념은 성립하므로 기본값은 빈 배열이다.
  aliases: z.array(z.string().min(1, 'alias must not be empty')).default([]),
  description: z.object({
    definition: z.string().min(1),
    analogy: z.string().default(''),
    components: z.array(z.string()).default([]),
    example: z.string().default(''),
  }),
  // 이 개념이 스스로 관리하는 대상. 개념이 사라지면 함께 사라지는 것들이며,
  // 허용·제한 행동이 바꾸는 것이 바로 이 대상이다. 옛 본문에는 없던 칸이라 기본값은 비어 있다.
  state: z
    .object({
      managed: z.array(z.string()).default([]),
    })
    .default({}),
  purpose: z.object({
    reason: z.string().min(1).max(2000),
    benefits: z.array(z.string()).default([]),
    vision: z.string().default(''),
    painPoints: z.array(z.string()).default([]),
  }),
  actions: z.object({
    allow: z.array(z.string()).default([]),
    restrict: z.array(z.string()).default([]),
    interaction: z.string().default(''),
  }),
  principle: z.object({
    immutableRules: z.array(z.string()).default([]),
    // 작동 원리 — 이 개념이 목적을 이루는 전형적인 한 장면("이렇게 하면 이렇게 된다").
    // 규칙 목록이 아니라 시나리오 한 문장이다. 옛 본문에는 없던 칸이라 기본값은 빈 문자열이다.
    operationalPrinciple: z.string().default(''),
    tradeoffs: z.string().default(''),
    lifecycle: z.array(z.string()).default([]),
  }),
  relations: z
    .object({
      prev: z.string().default(''),
      next: z.string().default(''),
      related: z.array(z.string()).default([]),
    })
    .default({}),
  codeLinks: z.array(z.string()).default([]),
});

export type Concept = z.infer<typeof ConceptSchema>;

export function parseConcept(input: unknown): Concept {
  return ConceptSchema.parse(input);
}
