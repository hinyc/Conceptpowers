// @concept:governance-mode
// src/hooks/gates/alwaysAsk.ts
// 강도와 무관하게 항상 사람에게 묻는 항목들(참고자료 기밀·거버넌스 설정 변경·삭제·판단 기록)을 한 판정으로 합친다 —
// 하나가 다른 하나를 가리지 않게 사유를 이어 붙인다.
import type { GateFinding } from './types.js';

export function mergeAlwaysAsk(...findings: (GateFinding | null)[]): GateFinding | null {
  const present = findings.filter((f): f is GateFinding => f !== null);
  if (present.length === 0) return null;
  if (present.length === 1) return present[0];
  return {
    gate: present.map((f) => f.gate).join('+'),
    reason: present.map((f) => f.reason).join(' / '),
    context: present
      .map((f) => f.context)
      .filter(Boolean)
      .join(' '),
  };
}
