// @concept:governance-mode
// src/hooks/gates/unapprovedRedGate.ts
import { sanitizeText } from '../../drift/safe.js';
import type { GateCheck } from './types.js';

export const checkUnapprovedRed: GateCheck = async ({ report }) => {
  if (report.unapprovedRefs.length === 0) return null;
  const list = report.unapprovedRefs.map((s) => sanitizeText(s)).join(', ');
  return {
    gate: 'unapproved-red',
    reason: `[WARNING] 미승인 개념 참조 (status=red) — ${list}. 사용자가 아직 승인하지 않은 개념을 참조합니다. 검토 후 승인(green)하고 커밋하세요.`,
    context:
      'Commit gate (D17): For the staged changes, confirm you ran check-concept (code↔concept) and, when concepts changed, check-consistency (concept↔concept). Some referenced concepts are still red (unapproved) — surface this prominently and let the user decide whether to commit.',
  };
};
