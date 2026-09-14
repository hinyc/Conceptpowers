// @concept:governance-mode @concept:init-gate
// tests/hooks/gateFailure.test.ts
// 문지기 자체가 실행 중 예외로 무너졌을 때(예: 스키마가 깨진 개념 파일 하나) 조용히 통과시키지 않는지 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 구성요소 "엄격(strict): … 커밋을 막는다" / "표준(standard): … 사람에게 묻는다" /
//    "가벼움(light): 멈추지 않고 … 경고로 모아 알린다" + 불변 "강도가 무엇이든 지키는 대상은 같다 —
//    바뀌는 것은 대응뿐이다"
//    → 검사를 실행하지 못한 커밋도 강도별 대응을 받는다: strict=deny, standard=ask, light=경고와 함께 진행
//      (상위 기준 문서의 "실패를 감추지 않는다"와 같은 태도 — 무출력 통과는 어떤 강도에서도 없다)
//  - governance-mode 불변 "강도 설정이 없거나 깨졌으면 표준(standard)으로 동작한다"
//    → init.json까지 깨진 상태에서 검사가 무너지면 ask
//  - init-gate 불변 "시작 명령과 상태 확인을 뺀 모든 명령은 실행 전에 초기화 여부를 확인한다"
//    → 초기화되지 않은 프로젝트의 세션 시작은 실패 안내 없이 무동작(null)
//  - init-gate 제한 "초기화 표시가 없는 상태를 정상으로 보고하는 것"의 반대편 — 초기화된 프로젝트에서 세션 시작
//    계산이 무너지면 "거버넌스가 꺼졌다"로 보이지 않도록 실패를 컨텍스트로 알린다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decidePreToolUseSafe } from '../../src/hooks/preToolUse.js';
import { buildSessionStartOutputSafe } from '../../src/hooks/sessionStart.js';
import { scaffoldInit } from '../../src/init/scaffold.js';

let root: string;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'cp-fail-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  await scaffoldInit(root, {});
});

function setEnforcement(level: 'strict' | 'standard' | 'light') {
  const p = join(root, 'docs/conceptpowers/init.json');
  const cfg = JSON.parse(readFileSync(p, 'utf8'));
  writeFileSync(p, JSON.stringify({ ...cfg, enforcement: level }, null, 2) + '\n');
}

// 스키마를 통과하지 못하는 개념 파일 — 개념 목록 읽기가 예외를 던진다.
function writeBrokenConcept() {
  const dir = join(root, 'docs/conceptpowers/concepts/data/misc');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'broken.json'), JSON.stringify({ slug: 'broken', status: 'approved' }));
}

const commitEvent = () => {
  writeFileSync(join(root, 'src/a.ts'), '// @concept:none\nexport const a = 1\n');
  return { tool: 'Bash', input: { command: 'git commit -m x' }, changedFiles: ['src/a.ts'] };
};

describe('커밋 게이트 실행 실패 (fail-closed)', () => {
  it('strict: 검사가 무너지면 커밋을 막는다 [규칙: 엄격은 막는다 · 지키는 대상은 같다]', async () => {
    setEnforcement('strict');
    writeBrokenConcept();
    const r = await decidePreToolUseSafe(root, commitEvent());
    expect(r!.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('GATE FAILURE');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('broken.json');
  });

  it('standard: 검사가 무너지면 사람에게 묻는다 [규칙: 표준은 묻는다]', async () => {
    setEnforcement('standard');
    writeBrokenConcept();
    const r = await decidePreToolUseSafe(root, commitEvent());
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('GATE FAILURE');
  });

  it('light: 멈추지 않되 검사 실패를 경고로 알린다 [규칙: 가벼움은 경고로 알린다]', async () => {
    setEnforcement('light');
    writeBrokenConcept();
    const r = await decidePreToolUseSafe(root, commitEvent());
    // 검증되지 않은 커밋이므로 자동 승인(allow)도 주지 않는다 — 평소 권한 확인에 맡긴다
    expect(r!.hookSpecificOutput.permissionDecision).toBeUndefined();
    expect(r!.hookSpecificOutput.additionalContext).toContain('GATE FAILURE');
  });

  it('init.json도 깨졌으면 표준으로 보고 묻는다 [규칙: 강도 설정이 깨졌으면 표준으로 동작]', async () => {
    writeFileSync(join(root, 'docs/conceptpowers/init.json'), '{ broken json');
    writeBrokenConcept();
    const r = await decidePreToolUseSafe(root, commitEvent());
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
  });

  it('strict: git이 스테이징 목록을 못 읽으면 빈 목록으로 통과시키지 않고 막는다 [규칙: 엄격은 막는다]', async () => {
    setEnforcement('strict'); // root는 git 저장소가 아니다 → 커밋될 트리를 만들지 못함
    const r = await decidePreToolUseSafe(root, {
      tool: 'Bash',
      input: { command: 'git commit -m x' },
    });
    expect(r!.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('커밋될 내용');
  });

  it('오류 문구의 프로젝트 절대경로는 상대경로로 줄여 싣는다', async () => {
    setEnforcement('strict');
    writeBrokenConcept();
    const r = await decidePreToolUseSafe(root, commitEvent());
    expect(r!.hookSpecificOutput.permissionDecisionReason).not.toContain(root);
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain(
      'docs/conceptpowers/concepts/data/misc/broken.json'
    );
  });

  it('커밋이 아닌 명령은 검사 실패 대응 대상이 아니다', async () => {
    setEnforcement('strict');
    writeBrokenConcept();
    const r = await decidePreToolUseSafe(root, { tool: 'Bash', input: { command: 'ls' } });
    expect(r).toBeNull();
  });

  it('검사가 정상이면 기존 판정을 그대로 돌려준다 [규칙: 지키는 대상은 같다]', async () => {
    setEnforcement('strict');
    writeFileSync(join(root, 'src/foo.ts'), 'export const foo = 1\n'); // 개념 없는 코드
    const r = await decidePreToolUseSafe(root, {
      tool: 'Bash',
      input: { command: 'git commit -m x' },
      changedFiles: ['src/foo.ts'],
    });
    expect(r!.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(r!.hookSpecificOutput.permissionDecisionReason).not.toContain('GATE FAILURE');
  });
});

describe('세션 시작 계산 실패', () => {
  const noUpdate = { checkForUpdate: async () => null };

  it('초기화된 프로젝트에서 계산이 무너지면 실패를 컨텍스트로 알린다 [규칙: 실패를 감추지 않는다]', async () => {
    writeBrokenConcept();
    const r = await buildSessionStartOutputSafe(root, '/plugin', noUpdate);
    expect(r!.hookSpecificOutput.additionalContext).toContain('CONCEPTPOWERS-ERROR');
    expect(r!.hookSpecificOutput.additionalContext).toContain('broken.json');
  });

  it('계산이 정상이면 원래 세션 컨텍스트를 그대로 돌려준다', async () => {
    const r = await buildSessionStartOutputSafe(root, '/plugin', noUpdate);
    expect(r!.hookSpecificOutput.additionalContext).toContain('CONCEPTPOWERS-ACTIVE');
    expect(r!.hookSpecificOutput.additionalContext).not.toContain('CONCEPTPOWERS-ERROR');
  });

  it('초기화되지 않은 프로젝트면 무동작이다 [규칙: 초기화 여부를 먼저 확인한다]', async () => {
    const bare = mkdtempSync(join(tmpdir(), 'cp-bare-'));
    const r = await buildSessionStartOutputSafe(bare, '/plugin', noUpdate);
    expect(r).toBeNull();
  });
});
