// @concept:governance-mode
// src/hooks/gates/unknownTagsGate.ts
import { sanitizeText } from '../../drift/safe.js';
import { gateText } from '../../i18n/gateMessages.js';
import { localeOf } from '../../schema/initConfig.js';
import type { GateCheck } from './types.js';

export const checkUnknownTags: GateCheck = async ({ report, cfg }) => {
  // 미지 태그 수로만 판정한다 — report.ok는 slug 중복도 포함하므로(감사 보고 몫) 여기서 쓰면 빈 경고가 난다
  if (report.unknownTags.length === 0) return null;
  const detail = report.unknownTags
    .map((t) => `${sanitizeText(t.file)} -> @concept:${sanitizeText(t.slug)} (undefined)`)
    .join(', ');
  return {
    gate: 'unknown-tags',
    reason: gateText[localeOf(cfg)].unknownTags(detail),
  };
};
