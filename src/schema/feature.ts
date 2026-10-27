// @concept:feature-spec-bridge @concept:globally-unique-slug
import { z } from 'zod';
import { SlugSchema } from './concept.js';

// feature는 "기능"의 1급 엔티티. 관련 개념(concepts)과 구현 경로(codePaths)의 단일 원본이다.
// concept↔feature 역방향(개념→기능)은 뷰어가 이 선언으로부터 파생한다.
// 이름표 규칙(모양·예약어)은 개념과 같은 하나를 쓴다.
const slug = SlugSchema;
const group = z
  .string()
  .regex(/^([a-z0-9]+(-[a-z0-9]+)*)(\/[a-z0-9]+(-[a-z0-9]+)*)*$/)
  .or(z.literal(''))
  .default('');

export const FeatureSchema = z.object({
  slug,
  group,
  title: z.string().min(1),
  description: z.string().default(''),
  concepts: z.array(slug).default([]),
  codePaths: z.array(z.string()).default([]),
});

export type Feature = z.infer<typeof FeatureSchema>;

export function parseFeature(input: unknown): Feature {
  return FeatureSchema.parse(input);
}
