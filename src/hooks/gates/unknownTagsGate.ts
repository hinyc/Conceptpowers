// @concept:governance-mode
// src/hooks/gates/unknownTagsGate.ts
import { sanitizeText } from '../../drift/safe.js';
import type { GateCheck } from './types.js';

export const checkUnknownTags: GateCheck = async ({ report }) => {
  // 미지 태그 수로만 판정한다 — report.ok는 slug 중복도 포함하므로(감사 보고 몫) 여기서 쓰면 빈 경고가 난다
  if (report.unknownTags.length === 0) return null;
  const detail = report.unknownTags
    .map((t) => `${sanitizeText(t.file)} -> @concept:${sanitizeText(t.slug)} (undefined)`)
    .join(', ');
  return {
    gate: 'unknown-tags',
    reason: `[WARNING] 정의되지 않은 개념 태그 — ${detail}. update-concepts로 개념을 정의하거나 태그를 고치세요.`,
  };
};
