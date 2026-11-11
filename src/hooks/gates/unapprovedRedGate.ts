// @concept:governance-mode
// src/hooks/gates/unapprovedRedGate.ts
import { sanitizeText } from '../../drift/safe.js';
import { gateText } from '../../i18n/gateMessages.js';
import type { GateCheck } from './types.js';

export const checkUnapprovedRed: GateCheck = async ({ report, locale }) => {
  if (report.unapprovedRefs.length === 0) return null;
  const list = report.unapprovedRefs.map((s) => sanitizeText(s)).join(', ');
  return {
    gate: 'unapproved-red',
    reason: gateText[locale].unapprovedRed(list),
    context:
      'Commit gate (D17): For the staged changes, confirm you ran conceptpowers:review (code↔concept) and, when concepts changed, the consistency check of conceptpowers:update-concepts (concept↔concept). Some referenced concepts are still red (unapproved) — surface this prominently. The enforcement level decides the response (strict denies, standard asks, light warns). Never approve a red concept to get past the gate; approval happens only on an explicit user request (update-concepts approve flow).',
  };
};
