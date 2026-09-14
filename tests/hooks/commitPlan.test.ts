// @concept:governance-mode
// tests/hooks/commitPlan.test.ts
// Bash 명령을 해석해 "무엇이 커밋되는가"를 가려내는 planCommit을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 정의 "커밋을 검사하는 문지기"
//    → 커밋이 아닌 명령(따옴표 속 글자를 다루는 읽기 명령, commit-tree, dry-run)은 검사 대상이 아니다
//  - governance-mode 불변 "문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다 — 명령을 실행하기 전에
//    그 파일들을 확정할 수 없으면 검사를 마친 것처럼 통과시키지 않고 강도에 맞춰 대응한다"
//    → 전역 옵션·래퍼·예약어·셸 -c·alias를 거쳐도 실제 커밋 호출과 범위(index·all·only·include)·위치를 찾는다
//    → 앞선 명령이 파일·색인·저장소를 바꾸거나 다른 명령을 실행할 수 있으면, 또는 인자가 셸 확장으로
//      정해지면 확정 불가로 표시한다
//    → 커밋을 실행할 수 있는 어떤 우회 형태도 "커밋 아님"으로 판정되지 않는다(우회 회귀 표)
//    → git 내장 명령은 설정이 주입돼도 alias로 풀리지 않으므로 커밋 아님이다 / 분류되지 않은 내장 명령 뒤의 커밋은
//      커밋될 파일을 바꿀 수 있어 확정 불가다
import { describe, it, expect } from 'vitest';
import { planCommit } from '../../src/hooks/command/commitPlan.js';

const noAlias = { resolveAlias: async () => null };
const label = (cmd: string) => JSON.stringify(cmd).slice(0, 70);

describe('커밋이 아닌 명령 [규칙: 문지기는 커밋을 검사한다]', () => {
  const cases = [
    'ls -la',
    'grep -rn "git commit" .',
    "echo 'git commit -m x'",
    'git log --grep="git commit"',
    'git commit-tree abc123 -m x',
    'git commit --dry-run -m x',
    'git commit --dry -m x',
    'git status && git diff --cached',
    'git frobnicate',
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.pager GIT_CONFIG_VALUE_0=cat git diff-tree -r HEAD',
    'export GIT_CONFIG_GLOBAL=/dev/null && git write-tree && git diff-index HEAD',
    'git checkout-index -a',
    'gh pr create --title "fix: git hook" --body "$(cat <<\'EOF\'\n- commit gate\nEOF\n)"',
    'find . -name "*.ts" | xargs grep -l "git commit"',
    'pnpm vitest run tests/hooks/commitGate.test.ts -t "git commit"',
  ];
  for (const cmd of cases) {
    it(`none: ${label(cmd)}`, async () => {
      expect((await planCommit(cmd, noAlias)).kind).toBe('none');
    });
  }
});

describe('실제 커밋 호출과 범위 [규칙: 커밋에 실제로 들어갈 파일 기준]', () => {
  const indexCases = [
    'git commit -m "x"',
    'git commit -m "a && git add ."',
    'git -c user.name=x commit -m x',
    'git --no-pager commit -m x',
    'command git commit -m x',
    'GIT_AUTHOR_NAME=x git commit -m x',
    'sh -c "git commit -m x"',
    'git commit --amend --no-edit',
    'git commit -F msg.txt',
    'git commit --mes wip',
    'git commit -m x && git push',
    'git status && git commit -m x',
    'git stash list && git commit -m x',
    'git checkout -b feat && git commit -m x',
    'if git commit -m x; then :; fi',
    '! git commit -m x',
    '{ git commit -m x; }',
    '=git commit -m x',
    "echo $'\\'' ; git commit -m x",
    'git commit -m x; echo $(git add -A)',
    "git commit -q -F - <<'EOF'\nfix: 메시지 속 git add . && git commit 글자\nEOF",
    "git commit -m \"$(cat <<'EOF'\nfix: don't stop\nEOF\n)\"",
    'git commit -m "$(cat <<\'EOF\'\nfix: 요약\n\n1) `planCommit` 해석 2) 훅 연결\nEOF\n)"',
    'git commit -m "$(cat <<\'EOF\'\nfix: smile :) and `x`\nEOF\n)"',
    'git commit --message="$MSG"',
    'git commit -m"$(cat <<\'EOF\'\nmsg\nEOF\n)"',
    'git commit -m x 2>&1 | tail -3',
    '(cd /tmp && ls) && git commit -m x',
  ];
  for (const cmd of indexCases) {
    it(`index: ${label(cmd)}`, async () => {
      expect(await planCommit(cmd, noAlias)).toMatchObject({
        kind: 'commit',
        scope: 'index',
        pathspecs: [],
      });
    });
  }

  it('서브셸 안의 cd는 바깥 커밋의 위치를 바꾸지 않는다', async () => {
    const plan = await planCommit('(cd sub); git commit -m x a.ts', noAlias);
    expect(plan).toMatchObject({ kind: 'commit', scope: 'only', pathspecs: ['a.ts'] });
    expect(plan).not.toHaveProperty('cwd');
  });

  it('-C·cd로 옮긴 위치를 커밋 위치로 함께 표시한다', async () => {
    expect(await planCommit('git -C packages/a commit -m x', noAlias)).toMatchObject({
      kind: 'commit',
      cwd: 'packages/a',
    });
    expect(await planCommit('cd sub && git commit -m x', noAlias)).toMatchObject({
      kind: 'commit',
      cwd: 'sub',
    });
    expect(await planCommit('cd sub && git -C inner commit -m x', noAlias)).toMatchObject({
      kind: 'commit',
      cwd: 'sub/inner',
    });
    expect(await planCommit('cd /abs/repo && git commit -m x', noAlias)).toMatchObject({
      kind: 'commit',
      cwd: '/abs/repo',
    });
  });

  for (const cmd of [
    'git commit -am "x"',
    'git commit -a -m x',
    'git commit --all -m x',
    'git commit -qam x',
    'git commit -va -m x',
    'noglob git commit -am x',
    'git -c alias.zz=commit zz -am x',
  ]) {
    it(`all: ${label(cmd)}`, async () => {
      expect(await planCommit(cmd, noAlias)).toMatchObject({ kind: 'commit', scope: 'all' });
    });
  }

  it('경로를 지정한 커밋은 그 경로만 들어간다(only)', async () => {
    expect(await planCommit('git commit -m x src/a.ts src/b.ts', noAlias)).toMatchObject({
      kind: 'commit',
      scope: 'only',
      pathspecs: ['src/a.ts', 'src/b.ts'],
    });
    expect(await planCommit('git commit -o -m x -- src/a.ts', noAlias)).toMatchObject({
      kind: 'commit',
      scope: 'only',
      pathspecs: ['src/a.ts'],
    });
    expect(await planCommit('git commit --amend -o', noAlias)).toMatchObject({
      kind: 'commit',
      scope: 'only',
      pathspecs: [],
    });
  });

  it('-i(약어 포함) 경로 커밋은 스테이징에 그 경로를 더한다(include)', async () => {
    for (const cmd of ['git commit -i -m x src/a.ts', 'git commit --inc -m x src/a.ts']) {
      expect(await planCommit(cmd, noAlias)).toMatchObject({
        kind: 'commit',
        scope: 'include',
        pathspecs: ['src/a.ts'],
      });
    }
  });

  it('저장소 설정의 alias를 풀어 커밋을 찾는다', async () => {
    const resolveAlias = async (name: string) => (name === 'ci' ? 'commit -a' : null);
    expect(await planCommit('git ci -m x', { resolveAlias })).toMatchObject({
      kind: 'commit',
      scope: 'all',
    });
  });
});

describe('실행 전에 커밋 파일을 확정할 수 없음 [규칙: 확정할 수 없으면 통과시키지 않는다]', () => {
  const cases = [
    'git add -A && git commit -m x',
    'git add . ; git commit -m x',
    'git stash && git commit -m x',
    'git rm old.ts && git commit -m x',
    'git submodule add u p && git commit -m x',
    'git config alias.zz commit && git zz -am x',
    'git commit -m a && git commit -m b',
    'eval "git commit -m x"',
    'echo $(git commit -m x)',
    '$GIT commit -m x',
    'X=commit; git $X -a -m x',
    'git commit $(echo -a) -m x',
    'git commit $FLAGS -m x',
    'git commit "$@"',
    'GIT_DIR=/tmp/other git commit -m x',
    'export GIT_INDEX_FILE=/tmp/i; git commit -m x',
    'git --git-dir=/tmp/other commit -m x',
    'git -c core.worktree=/tmp/o commit -am x',
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.zz GIT_CONFIG_VALUE_0=commit git zz -am x',
    'git commit -p',
    'git commit --interact',
    'git commit --pathspec-from-file=list.txt -m x',
    'bash -c "git add . && git commit -m x"',
    'sed -i "" s/x// src/a.ts && git commit -am x',
    'pnpm prettier --write . && git commit -am x',
    'npx lint-staged && git commit -m x',
    'echo x > src/a.ts && git commit -am x',
    'f() { git add .; }; f; git commit -m x',
    'cd ~ && git commit -m x',
    'while :; do git commit -m x; git add -A; done',
    'until false; do git commit -m x; done',
    'echo() { git commit -m x; }; git add -A; echo',
    'git --icase-pathspecs commit -m x SRC/A.ts',
    'GIT_ICASE_PATHSPECS=1 git commit -m x SRC/A.ts',
    'git diff --output=src/a.ts HEAD~1 && git commit -am x',
    'git checkout-index -a -f && git commit -am x',
    'git merge-file a.ts base.ts b.ts && git commit -am x',
    'git commit -m x & git add -A',
    'git commit -m x | git add -A',
    '(( x = 1<<2 ))\ngit commit -a -m x',
  ];
  for (const cmd of cases) {
    it(`unresolved: ${label(cmd)}`, async () => {
      const plan = await planCommit(cmd, noAlias);
      expect(plan.kind).toBe('unresolved');
      if (plan.kind === 'unresolved') expect(plan.reason.length).toBeGreaterThan(0);
    });
  }

  it('셸 alias(!)가 스테이징과 커밋을 함께 하면 확정 불가다', async () => {
    const resolveAlias = async (name: string) =>
      name === 'ship' ? '!git add -A && git commit' : null;
    expect((await planCommit('git ship -m x', { resolveAlias })).kind).toBe('unresolved');
  });
});

describe('우회 회귀 표 — 커밋을 실행할 수 있으면 "커밋 아님"이 아니다 [규칙: 확정할 수 없으면 통과시키지 않는다]', () => {
  const bypasses = [
    'if git commit -am x; then :; fi',
    '! git commit -am x',
    '{ git commit -am x; }',
    'f() { git commit -am x; }; f',
    'for f in a; do git add $f; done; git commit -m x',
    '(git add . ; git commit -m x)',
    'timeout 5 git commit -am x',
    'find . -exec git commit -am x \\;',
    "env -S 'git commit -a -m x'",
    '=git commit -am x',
    'noglob git commit -am x',
    'repeat 1 git commit -am x',
    'cat <<EOF\n$(git commit -a -m x)\nEOF',
    'echo hi > "$(git commit -a -m x)"',
    'echo hi >`git commit -a -m x`',
    '(( x = 1<<2 ))\ngit commit -a -m x',
    'echo $[1<<2]\ngit commit -a -m x',
    "echo $'\\'' ; git commit -a -m x ; echo $'\\''",
    'X=commit; git $X -a -m x',
    'git -c alias.zz=commit zz -am x',
    'git ls-files -m | xargs git commit -m wip',
    "echo 'git commit -am x' | bash",
    "git rebase -x 'git commit --amend -am x' HEAD~1",
    "python3 - <<'PY'\nimport os\nos.system('git commit -m x')\nPY",
    'git\tcommit -am x',
    '\\git commit -am x',
    "'git' commit -am x",
    'g"it" commit -am x',
    '/usr/bin/git commit -am x',
    'exec git commit -am x',
    'git add . & git commit -m x',
    'echo $(( $(git commit -am x >/dev/null; echo 1) ))',
    'echo $((git commit -am x) )',
    'echo "${x-\'}"; git commit -am x',
    'echo "$(cat <<\'X\'\ndon\'t\nX\n) echo "; git commit -am x; echo ""',
    '((:); gi""t commit -am x)',
    'git commit --dry-run --no-dry-run -am x',
    'while :; do git commit -m x; git add -A; done',
    'echo() { git commit -m x; }; git add -A; echo',
  ];
  for (const cmd of bypasses) {
    it(`not none: ${label(cmd)}`, async () => {
      expect((await planCommit(cmd, noAlias)).kind).not.toBe('none');
    });
  }
});
