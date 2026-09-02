// @concept:governance-mode @concept:init-gate @concept:concept-code-mapping
// tests/hooks/gates.modes.test.ts
// 문지기 강도(strict·light·폴백)에 따른 대응을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 구성요소 "엄격(strict): 발견한 문제 전부를 한 번에 보여주며 커밋을 막는다"
//    → 위반이 있으면 deny하고 위반 전부를 한 메시지에 모은다
//  - governance-mode 구성요소 "가벼움(light): 멈추지 않고 발견한 문제 전부를 한 번에 경고로 모아 알린다"
//    → 위반이 있어도 allow하고 경고 전부를 additionalContext로 전달한다 / stale 산출물도 경고 집합에 포함
//  - governance-mode 불변 "강도가 무엇이든 지키는 대상(검사 항목)은 같다 — 바뀌는 것은 대응뿐이다"
//    → 위반이 없으면 allow / 참조 문서와 위반이 함께 있어도 위반이 가려지지 않는다(strict·light 양쪽)
//    → stale 산출물만 있으면 strict에서도 deny가 아니라 ask (대응만 다르다)
//  - concept-code-mapping 구성요소 "대상: … 무시 목록에 등록된 생성물·외부 코드는 대상이 아니다"
//    → strict에서도 ignoreGlobs 경로에 실려 온 미지 태그는 deny 사유가 되지 않는다
//  - governance-mode 불변 "참고자료 기밀 확인은 어느 강도에서나 반드시 사람에게 묻는다"
//    → 기밀 reference 문서는 strict여도, light여도 ask다
//  - governance-mode 불변 "강도 설정이 없거나 깨졌으면 표준(standard)으로 동작한다"
//    → init.json이 깨져도 첫 위반에서 ask한다
//  - "게이트 실행 실패는 findings가 비어 있어도 알린다"는 상위 기준 문서 "갈아 끼우기 방식"의 불변 "실패를 감추지
//    않는다"와 같은 태도를 문지기에 적용한 것이다.
// governance-mode 개념의 불변 규칙에서 도출한 시나리오들. 각 테스트 이름 끝에 검증 규칙을 명시한다.
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    const r = await decidePreToolUse(root, commitEvent(['docs/conceptpowers/reference/계약서.md']));
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
  it('참조 문서만 있고(위반 없음) 게이트 하나가 실행 중 실패하면, ask하되 실패한 게이트를 알린다 [규칙: 실행 실패는 findings가 비어 있어도 조용히 묻히지 않는다]', async () => {
    // GOVERNANCE_GATES의 어떤 검사도 정상 fixture로는 throw하지 않는다(모두 내부에서
    // best-effort로 스스로 catch하거나, 이미 계산된 report에 대한 순수 동기 접근이다) —
    // 그래서 이 시나리오는 실제 예외 상황을 재현할 프로덕션 쪽 테스트 훅이 없고, 대신
    // vitest의 표준 모듈 모킹(vi.doMock + 동적 import, 이 테스트 안에서만 유효하고
    // 끝나면 원복)으로 게이트 하나가 실제로 throw하는 상황을 재현해 수정된 코드 경로
    // (strict의 참조 전용 분기가 failedGates를 ask의 additionalContext에 싣는지)를
    // decidePreToolUse를 통해 그대로 검증한다.
    setEnforcement(root, 'strict');
    writeFileSync(join(root, 'docs/conceptpowers/reference/계약서.md'), '기밀 내용\n');
    vi.resetModules();
    vi.doMock('../../src/hooks/gates/unknownTagsGate.js', () => ({
      checkUnknownTags: async () => {
        throw new Error('시뮬레이션: 게이트 실행 실패');
      },
    }));
    try {
      const { decidePreToolUse: decideWithThrowingGate } =
        await import('../../src/hooks/preToolUse.js');
      const r = await decideWithThrowingGate(
        root,
        commitEvent(['docs/conceptpowers/reference/계약서.md'])
      );
      expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
      expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('reference');
      expect(r!.hookSpecificOutput.additionalContext).toContain('실행 실패');
      expect(r!.hookSpecificOutput.additionalContext).toContain('unknown-tags');
    } finally {
      vi.doUnmock('../../src/hooks/gates/unknownTagsGate.js');
      vi.resetModules();
    }
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
    const r = await decidePreToolUse(root, commitEvent(['docs/conceptpowers/reference/계약서.md']));
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

// concept-driven-tests 허용 "붙잡는 방식(차단·질문·경고)은 문지기 강도가 정한다" —
// 같은 검사 항목이 강도에 따라 차단/질문/경고로만 달라진다(governance-mode 불변과 같은 축).
describe('검사 관련 문지기의 강도별 대응', () => {
  // 일반 코드에는 허용되는 '해당 개념 없음' 표시 — 검사 파일에서는 범위 문지기만 걸린다
  // (개념 없는 코드 문지기는 이 표시를 인정하므로 새 문지기의 대응만 남는다).
  const noConceptTest = () => {
    mkdirSync(join(root, 'tests'), { recursive: true });
    writeFileSync(
      join(root, 'tests/pay.test.ts'),
      '// @concept:none\nimport { it } from "vitest"\n'
    );
  };

  it("strict면 '해당 개념 없음' 검사 파일이 커밋을 막는다 [규칙: 엄격은 차단한다]", async () => {
    setEnforcement(root, 'strict');
    noConceptTest();
    const r = await decidePreToolUse(root, commitEvent(['tests/pay.test.ts']));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('TEST SCOPE');
  });

  it('standard면 같은 검사 항목이 차단이 아니라 질문이다 [규칙: 지키는 대상은 같고 대응만 다르다]', async () => {
    setEnforcement(root, 'standard');
    noConceptTest();
    const r = await decidePreToolUse(root, commitEvent(['tests/pay.test.ts']));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('TEST SCOPE');
  });

  it('light면 막지 않고 경고로만 알린다 [규칙: 가벼움은 경고로 모아 알린다]', async () => {
    setEnforcement(root, 'light');
    noConceptTest();
    const r = await decidePreToolUse(root, commitEvent(['tests/pay.test.ts']));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(r!.hookSpecificOutput.additionalContext).toContain('TEST SCOPE');
  });

  it('strict: 무시 목록 경로 생성물의 미지 태그는 deny 사유가 되지 않는다', async () => {
    setEnforcement(root, 'strict');
    const rel = 'docs/conceptpowers/concepts/viewer/assets/viewer.js';
    mkdirSync(join(root, 'docs/conceptpowers/concepts/viewer/assets'), { recursive: true });
    writeFileSync(join(root, rel), '// @concept:home-search\n');
    const r = await decidePreToolUse(root, commitEvent([rel]));
    expect(r!.hookSpecificOutput.permissionDecision).toBe('allow');
    expect(r!.hookSpecificOutput.permissionDecisionReason ?? '').not.toContain('home-search');
  });

  it('이름표가 있는 검사 파일은 strict에서도 통과한다', async () => {
    setEnforcement(root, 'strict');
    mkdirSync(join(root, 'tests'), { recursive: true });
    writeFileSync(
      join(root, 'tests/pay.test.ts'),
      '// @concept:none-such\nimport { it } from "vitest"\n'
    );
    const r = await decidePreToolUse(root, commitEvent(['tests/pay.test.ts']));
    // 미정의 개념을 가리키는 것은 unknown-tags가 잡는 별개 문제다 — 범위 문지기는 걸리지 않는다.
    expect(r!.hookSpecificOutput.permissionDecisionReason ?? '').not.toContain('TEST SCOPE');
  });
});
