// @concept:governance-mode @concept:drift-reconcile
// tests/hooks/commitGate.test.ts
// 커밋 게이트가 명령 해석 결과로 "실제로 커밋될 파일"을 검사하고, 확정할 수 없는 커밋에 강도별로 대응하는지
// 실제 git 저장소에서 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 불변 "문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다 — 명령을 실행하기 전에
//    그 파일들을 확정할 수 없으면 검사를 마친 것처럼 통과시키지 않고 강도에 맞춰 대응한다"
//    → git commit -a는 스테이징되지 않은 추적 파일까지 검사한다(strict면 그 위반으로 deny)
//    → git -C . commit도 게이트가 검사한다
//    → git add … && git commit 은 strict=deny, standard=ask, light=판정 없이 경고
//  - governance-mode 정의 "커밋을 검사하는 문지기"
//    → "git commit" 글자가 인자로만 들어간 명령은 스테이징에 위반이 있어도 검사하지 않는다
//  - drift-reconcile 불변 "결산은 커밋이 성공한 뒤에만 한다" + "커밋 전 문지기의 판정과 커밋 뒤 결산은 같은 잣대"
//    → 커밋 뒤 결산도 같은 명령 해석을 쓴다: git -C . commit 뒤에는 결산하고, 글자만 든 명령 뒤에는 하지 않는다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decidePreToolUse } from '../../src/hooks/preToolUse.js';
import { runPostToolUse } from '../../src/hooks/postToolUse.js';
import { scaffoldInit } from '../../src/init/scaffold.js';

let root: string;
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', ...args], {
    cwd: root,
    encoding: 'utf8',
  });

function setEnforcement(level: 'strict' | 'standard' | 'light') {
  const p = join(root, 'docs/conceptpowers/init.json');
  const cfg = JSON.parse(readFileSync(p, 'utf8'));
  writeFileSync(p, JSON.stringify({ ...cfg, enforcement: level }, null, 2) + '\n');
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'cp-gate-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  await scaffoldInit(root, {});
  writeFileSync(join(root, 'src/tracked.ts'), '// @concept:none\nexport const t = 1\n');
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  // 추적 중인 파일에서 표식을 지운 미스테이징 수정 — -a 커밋에만 실린다
  writeFileSync(join(root, 'src/tracked.ts'), 'export const t = 2\n');
});

const bash = (command: string) => ({ tool: 'Bash', input: { command } });

describe('실제로 커밋될 파일 기준 검사 [규칙: 커밋에 실제로 들어갈 파일 기준]', () => {
  it('strict: git commit -a는 미스테이징 추적 파일의 위반까지 검사해 막는다', async () => {
    setEnforcement('strict');
    const r = await decidePreToolUse(root, bash('git commit -am "x"'));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('tracked.ts');
  });

  it('strict: 같은 상태에서 스테이징만 커밋하면 그 파일은 검사 대상이 아니다', async () => {
    setEnforcement('strict');
    const r = await decidePreToolUse(root, bash('git commit -m "x"'));
    expect(r!.hookSpecificOutput.permissionDecision).toBeUndefined();
  });

  it('strict: git -C . commit 도 검사한다', async () => {
    setEnforcement('strict');
    git('add', 'src/tracked.ts');
    const r = await decidePreToolUse(root, bash('git -C . commit -m x'));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('deny');
  });
});

describe('실행 전에 확정할 수 없는 커밋 [규칙: 확정할 수 없으면 강도에 맞춰 대응한다]', () => {
  const cmd = 'git add -A && git commit -m x';

  it('strict: 막는다', async () => {
    setEnforcement('strict');
    const r = await decidePreToolUse(root, bash(cmd));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('COMMIT UNRESOLVED');
  });

  it('standard: 묻는다', async () => {
    setEnforcement('standard');
    const r = await decidePreToolUse(root, bash(cmd));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
  });

  it('light라도 커밋에 섞여 들어갈 수 있는 설정 변경이 있으면 묻는다 [규칙: 거버넌스 설정 변경은 강도와 무관하게 묻는다]', async () => {
    setEnforcement('light');
    const r = await decidePreToolUse(root, bash(cmd));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('GOVERNANCE CONFIG');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('COMMIT UNRESOLVED');
  });
  it('light: 설정 변경을 담지 않는 좁은 스테이징이면 디스크의 설정 변경으로 묻지 않는다 [규칙: 들어가지 않을 변경으로 묻지 않는다]', async () => {
    setEnforcement('light');
    const r = await decidePreToolUse(root, bash('git add src/tracked.ts && git commit -m x'));
    expect(r!.hookSpecificOutput.permissionDecision).toBeUndefined();
    expect(r!.hookSpecificOutput.additionalContext).toContain('COMMIT UNRESOLVED');
  });
  it('light: 스테이징해 둔 설정 변경은 좁은 스테이징이어도 묻는다', async () => {
    setEnforcement('light');
    git('add', 'docs/conceptpowers/init.json');
    const r = await decidePreToolUse(root, bash('git add src/tracked.ts && git commit -m x'));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('GOVERNANCE CONFIG');
  });
  it('light: 판정 없이 경고로 알린다', async () => {
    setEnforcement('light');
    git('add', 'docs/conceptpowers/init.json');
    git('commit', '-q', '-m', 'light');
    const r = await decidePreToolUse(root, bash(cmd));
    expect(r!.hookSpecificOutput.permissionDecision).toBeUndefined();
    expect(r!.hookSpecificOutput.additionalContext).toContain('COMMIT UNRESOLVED');
  });
});

describe('프로젝트 밖으로 옮긴 커밋 [규칙: 확정할 수 없으면 강도에 맞춰 대응한다]', () => {
  it('strict: cd로 프로젝트 밖에 가서 하는 커밋은 막는다', async () => {
    setEnforcement('strict');
    const r = await decidePreToolUse(root, bash(`cd ${tmpdir()} && git commit -m x`));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('COMMIT UNRESOLVED');
  });

  it('cd로 프로젝트 안의 폴더에 들어가 경로를 지정한 커밋은 그 폴더 기준 경로로 검사한다', async () => {
    setEnforcement('strict');
    const r = await decidePreToolUse(root, bash('cd src && git commit -m x tracked.ts'));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('tracked.ts');
  });
});

describe('커밋이 아닌 명령 [규칙: 문지기는 커밋을 검사한다]', () => {
  it('strict: "git commit" 글자가 인자로만 든 명령은 스테이징에 위반이 있어도 검사하지 않는다', async () => {
    setEnforcement('strict');
    git('add', 'src/tracked.ts');
    const r = await decidePreToolUse(root, bash('grep -rn "git commit" src'));
    expect(r).toBeNull();
  });
});

describe('커밋 뒤 결산도 같은 명령 해석 [규칙: 커밋 전 판정과 커밋 뒤 결산은 같은 잣대]', () => {
  it('git -C . commit 뒤에는 결산한다', async () => {
    const r = await runPostToolUse(root, {
      tool: 'Bash',
      input: { command: 'git -C . commit -m x' },
      committedFiles: ['src/tracked.ts'],
    });
    expect(r).not.toBeNull();
  });

  it('"git commit" 글자만 든 명령 뒤에는 결산하지 않는다', async () => {
    const r = await runPostToolUse(root, {
      tool: 'Bash',
      input: { command: 'echo "git commit"' },
      committedFiles: ['src/tracked.ts'],
    });
    expect(r).toBeNull();
  });
});
