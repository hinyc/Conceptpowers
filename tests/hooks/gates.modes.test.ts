// @concept:governance-mode @concept:init-gate
// tests/hooks/gates.modes.test.ts
// governance-mode 개념의 불변 규칙에서 도출한 시나리오들. 각 테스트 이름 끝에 검증 규칙을 명시한다.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decidePreToolUse } from '../../src/hooks/preToolUse.js';
import { scaffoldInit } from '../../src/init/scaffold.js';

let root: string;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  await scaffoldInit(root, {});
});

function setEnforcement(root: string, level: 'strict' | 'standard' | 'light') {
  const p = join(root, 'docs/conceptpowers/init.json');
  const cfg = JSON.parse(readFileSync(p, 'utf8'));
  writeFileSync(p, JSON.stringify({ ...cfg, enforcement: level }, null, 2) + '\n');
}

const commitEvent = (changedFiles: string[]) => ({
  tool: 'Bash',
  input: { command: 'git commit -m x' },
  changedFiles,
});

// stale-artifact 게이트는 실제 git 저장소에서 unstaged diff를 본다 — tests/hooks/preToolUse.test.ts의
// "viewer 생성 산출물이 unstaged dirty면 ..." 픽스처와 동일한 패턴.
function initGitRepoWithStaleViewerArtifact(root: string) {
  execSync('git init', { cwd: root });
  execSync('git config user.email "test@test.com"', { cwd: root });
  execSync('git config user.name "Test"', { cwd: root });
  execSync('git add -A && git commit -m init', { cwd: root });
  writeFileSync(
    join(root, 'docs/conceptpowers/concepts/viewer/manifest.json'),
    '{"generatorVersion":"9.9.9"}\n'
  );
}

describe('strict 모드 (차단)', () => {
  it('위반이 있으면 deny하고, 걸린 위반 전부를 한 메시지에 모은다 [규칙: 엄격은 전부 보여주며 거부]', async () => {
    setEnforcement(root, 'strict');
    writeFileSync(join(root, 'src/a.ts'), '// @concept:ghost\n'); // 미정의 태그
    writeFileSync(join(root, 'src/foo.ts'), 'export const foo = 1\n'); // 개념 없는 코드
    const r = await decidePreToolUse(root, commitEvent(['src/a.ts', 'src/foo.ts']));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('ghost');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('foo.ts');
  });
  it('기밀 reference 문서는 strict여도 차단이 아니라 ask다 [규칙: 기밀 확인은 항상 묻는다]', async () => {
    setEnforcement(root, 'strict');
    const r = await decidePreToolUse(
      root,
      commitEvent(['docs/conceptpowers/reference/계약서.md'])
    );
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('reference');
  });
  it('위반이 없으면 allow한다 [규칙: 지키는 대상은 같다 — 대응만 다르다]', async () => {
    setEnforcement(root, 'strict');
    const r = await decidePreToolUse(root, commitEvent([]));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('allow');
  });
  it('stale 산출물만 있으면 strict에서도 deny가 아니라 ask다 [규칙: 정리용 게이트는 strict에서도 차단하지 않는다]', async () => {
    setEnforcement(root, 'strict');
    initGitRepoWithStaleViewerArtifact(root);
    const r = await decidePreToolUse(root, commitEvent([]));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('미커밋 생성 산출물');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('manifest.json');
  });
  it('참조 문서 스테이징 + 동시 위반이 있으면 deny하고 메시지에 참조 문서와 위반을 함께 담는다 [규칙: 강도가 무엇이든 지키는 대상은 같다 — reference가 위반을 가리면 안 된다]', async () => {
    setEnforcement(root, 'strict');
    writeFileSync(join(root, 'src/a.ts'), '// @concept:ghost\n');
    writeFileSync(join(root, 'docs/conceptpowers/reference/계약서.md'), '기밀 내용\n');
    const r = await decidePreToolUse(
      root,
      commitEvent(['src/a.ts', 'docs/conceptpowers/reference/계약서.md'])
    );
    expect(r!.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('ghost');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('reference');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('계약서.md');
  });
});

describe('light 모드 (경고만)', () => {
  it('위반이 있어도 allow하고, 걸린 경고 전부를 additionalContext로 전달한다 [규칙: 가벼움은 전부 모아 보고]', async () => {
    setEnforcement(root, 'light');
    writeFileSync(join(root, 'src/a.ts'), '// @concept:ghost\n');
    writeFileSync(join(root, 'src/foo.ts'), 'export const foo = 1\n');
    const r = await decidePreToolUse(root, commitEvent(['src/a.ts', 'src/foo.ts']));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(r!.hookSpecificOutput.additionalContext).toContain('GOVERNANCE WARNINGS');
    expect(r!.hookSpecificOutput.additionalContext).toContain('ghost');
    expect(r!.hookSpecificOutput.additionalContext).toContain('foo.ts');
  });
  it('기밀 reference 문서는 light여도 ask다 [규칙: 기밀 확인은 항상 묻는다]', async () => {
    setEnforcement(root, 'light');
    const r = await decidePreToolUse(
      root,
      commitEvent(['docs/conceptpowers/reference/계약서.md'])
    );
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
  });
  it('경고가 없으면 기본 allow 컨텍스트를 반환한다', async () => {
    setEnforcement(root, 'light');
    const r = await decidePreToolUse(root, commitEvent([]));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(r!.hookSpecificOutput.additionalContext ?? '').not.toContain('GOVERNANCE WARNINGS');
  });
  it('stale 산출물은 light의 경고 집합에 포함된다 [규칙: 가벼움은 전부 모아 보고]', async () => {
    setEnforcement(root, 'light');
    initGitRepoWithStaleViewerArtifact(root);
    const r = await decidePreToolUse(root, commitEvent([]));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(r!.hookSpecificOutput.additionalContext).toContain('GOVERNANCE WARNINGS');
    expect(r!.hookSpecificOutput.additionalContext).toContain('manifest.json');
  });
  it('참조 문서 스테이징 + 동시 위반이 있으면 참조 문서로 ask하되, 경고가 additionalContext에 남는다 [규칙: 기밀 확인은 항상 묻는다 · 가벼움은 전부 모아 보고 — 잃어버리면 안 된다]', async () => {
    setEnforcement(root, 'light');
    writeFileSync(join(root, 'src/a.ts'), '// @concept:ghost\n');
    writeFileSync(join(root, 'docs/conceptpowers/reference/계약서.md'), '기밀 내용\n');
    const r = await decidePreToolUse(
      root,
      commitEvent(['src/a.ts', 'docs/conceptpowers/reference/계약서.md'])
    );
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('reference');
    expect(r!.hookSpecificOutput.additionalContext).toContain('ghost');
  });
});

describe('enforcement 폴백', () => {
  it('init.json이 깨져도(standard 폴백) 첫 위반에서 ask한다 [규칙: 깨졌으면 표준으로 동작]', async () => {
    writeFileSync(join(root, 'docs/conceptpowers/init.json'), '{ broken json');
    writeFileSync(join(root, 'src/foo.ts'), 'export const foo = 1\n');
    const r = await decidePreToolUse(root, commitEvent(['src/foo.ts']));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
  });
});
