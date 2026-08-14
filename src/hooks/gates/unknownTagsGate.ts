// @concept:governance-mode
// src/hooks/gates/unknownTagsGate.ts
import { sanitizeText } from '../../drift/safe.js';
import type { GateCheck } from './types.js';

export const checkUnknownTags: GateCheck = async ({ report }) => {
  if (report.ok) return null;
  const detail = report.unknownTags
    .map((t) => `${sanitizeText(t.file)} -> @concept:${sanitizeText(t.slug)} (undefined)`)
    .join(', ');
  return {
    gate: 'unknown-tags',
    reason: `[WARNING] 정의되지 않은 개념 태그 — ${detail}. define-concept로 개념을 정의하거나 태그를 고치세요.`,
  };
};
