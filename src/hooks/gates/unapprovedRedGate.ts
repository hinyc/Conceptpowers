// @concept:governance-mode
// src/hooks/gates/unapprovedRedGate.ts
import { sanitizeText } from '../../drift/safe.js';
import type { GateCheck } from './types.js';

export const checkUnapprovedRed: GateCheck = async ({ report }) => {
  if (report.unapprovedRefs.length === 0) return null;
  const list = report.unapprovedRefs.map((s) => sanitizeText(s)).join(', ');
  return {
    gate: 'unapproved-red',
    reason: `[WARNING] 미승인 개념 참조 (status=red) — ${list}. 사용자가 아직 승인하지 않은 개념을 참조합니다. 승인은 사용자가 직접 요청할 때만 합니다(update-concepts 승인 흐름) — 커밋을 통과시키려고 승인하지 않습니다.`,
    context:
      'Commit gate (D17): For the staged changes, confirm you ran conceptpowers:review (code↔concept) and, when concepts changed, the consistency check of conceptpowers:update-concepts (concept↔concept). Some referenced concepts are still red (unapproved) — surface this prominently. The enforcement level decides the response (strict denies, standard asks, light warns). Never approve a red concept to get past the gate; approval happens only on an explicit user request (update-concepts approve flow).',
  };
};
