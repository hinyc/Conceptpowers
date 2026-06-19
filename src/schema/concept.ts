import { z } from 'zod'

export const ConceptCategory = z.enum(['feature', 'behavior', 'role', 'permission', 'term'])
export type ConceptCategory = z.infer<typeof ConceptCategory>

const RESERVED_SLUGS = new Set(['constructor', 'prototype', '__proto__'])
const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be kebab-case')
  .refine((s) => !RESERVED_SLUGS.has(s), 'slug must not be a reserved name')

// 승인 상태: green = 검증된 source of truth, pending = 사용자 작성·정착 전(미적용),
// red = 미승인(자동추론 기본/거부). 기본값은 red(특권 상태 pending은 명시 지정만).
export const ConceptStatus = z.enum(['green', 'pending', 'red'])
export type ConceptStatus = z.infer<typeof ConceptStatus>

export const ConceptSchema = z.object({
  slug,
  group: z.string().regex(/^([a-z0-9]+(-[a-z0-9]+)*)(\/[a-z0-9]+(-[a-z0-9]+)*)*$/).or(z.literal('')).default(''),
  category: z.array(ConceptCategory).min(1, 'category must have at least one item'),
  number: z.number().int().positive().optional(),
  status: ConceptStatus.default('red'),
  title: z.string().min(1),
  eyebrow: z.string().default(''),
  description: z.object({
    definition: z.string().min(1),
    analogy: z.string().default(''),
    components: z.array(z.string()).default([]),
    example: z.string().default('')
  }),
  purpose: z.object({
    reason: z.string().min(1).max(2000),
    benefits: z.array(z.string()).default([]),
    vision: z.string().default(''),
    painPoints: z.array(z.string()).default([])
  }),
  actions: z.object({
    allow: z.array(z.string()).default([]),
    restrict: z.array(z.string()).default([]),
    interaction: z.string().default('')
  }),
  principle: z.object({
    immutableRules: z.array(z.string()).default([]),
    tradeoffs: z.string().default(''),
    lifecycle: z.array(z.string()).default([])
  }),
  relations: z.object({
    prev: z.string().default(''),
    next: z.string().default(''),
    related: z.array(z.string()).default([])
  }).default({}),
  codeLinks: z.array(z.string()).default([])
})

export type Concept = z.infer<typeof ConceptSchema>

export function parseConcept(input: unknown): Concept {
  return ConceptSchema.parse(input)
}
