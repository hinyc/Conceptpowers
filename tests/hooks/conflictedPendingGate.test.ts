// @concept:governance-mode @concept:settled-status
// tests/hooks/conflictedPendingGate.test.ts
// 충돌한 보류 개념을 가리키는 커밋을 붙잡는 문지기(conflicted-pending)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - settled-status 불변 "충돌한 개념은 확정으로 올리지 않고 검토 중 상태에 머무르게 한다"
//    → 충돌 사유가 기록된 보류 개념을 가리키면 붙잡는다 / 기록이 없으면 통과
//  - governance-mode 불변 "검사 가운데 하나라도 실행하지 못했으면 그 커밋은 검사를 마친 것이 아니다"
//    → 충돌 사유 기록 파일이 있는데 깨져 있으면 "충돌 없음"으로 통과시키지 않고 던진다(실행 실패로 잡힌다)
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkConflictedPending } from '../../src/hooks/gates/conflictedPendingGate.js';
import { cpPaths } from '../../src/paths.js';
import type { GateInput } from '../../src/hooks/gates/types.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-conf-'));
});

const input = (pendingRefs: string[]): GateInput =>
  ({ root, files: [], cfg: null, locale: 'ko', report: { pendingRefs } }) as never;

function writeConflicts(text: string) {
  const p = cpPaths(root).pendingConflicts;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

describe('conflicted-pending 문지기', () => {
  it('충돌 사유가 기록된 보류 개념을 가리키면 붙잡는다 [규칙: 충돌한 개념은 확정으로 올리지 않는다]', async () => {
    writeConflicts(JSON.stringify({ 'pay-rule': '다른 개념과 충돌' }));
    const f = await checkConflictedPending(input(['pay-rule']));
    expect(f?.gate).toBe('conflicted-pending');
  });

  it('기록 파일이 없으면 충돌 없음으로 통과한다', async () => {
    expect(await checkConflictedPending(input(['pay-rule']))).toBeNull();
  });

  it('기록 파일이 깨져 있으면 던진다 [규칙: 검사를 실행하지 못했으면 검사를 마친 것이 아니다]', async () => {
    writeConflicts('{ broken');
    await expect(checkConflictedPending(input(['pay-rule']))).rejects.toThrow();
  });
});
