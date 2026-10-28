// @concept:governance-mode
// tests/hooks/commitPlan.test.ts
// Bash 명령을 해석해 "무엇이 커밋되는가"를 가려내는 planCommit을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 정의 "커밋을 검사하는 문지기"
//    → 커밋이 아닌 명령(따옴표 속 글자를 다루는 읽기 명령, dry-run, 커밋 없이 색인에만 반영하거나 멈추는
//      cherry-pick·revert·merge 제어 옵션)은 검사 대상이 아니다
//  - governance-mode 불변 "문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다 — 명령을 실행하기 전에
//    그 파일들을 확정할 수 없으면 검사를 마친 것처럼 통과시키지 않고 강도에 맞춰 대응한다"
//    → 전역 옵션·래퍼·예약어·셸 -c·alias를 거쳐도 실제 커밋 호출과 범위(index·all·only·include)·위치를 찾는다
//    → 앞선 명령이 파일·색인·저장소를 바꾸거나 다른 명령을 실행할 수 있으면, 또는 인자가 셸 확장으로
//      정해지면 확정 불가로 표시한다
//    → 커밋을 실행할 수 있는 어떤 우회 형태도 "커밋 아님"으로 판정되지 않는다(우회 회귀 표)
//    → 확정하지 못한 커밋에도 위치(확정 여부 포함)를 싣는다 — source·셸 확장·~·저장소를 바꾸는 옵션·환경 변수·위치를
//      바꾸는 래퍼(sudo -D)·조건부 cd(&&/|| 뒤·if 안)면 위치 불명, 하위 셸(sh -c)·파이프·백그라운드의 cd는 뒤 명령의 위치에
//      남지 않는다, 괄호 서브셸 안 cd는 따라가고 닫히면 되돌린다 / 셸 alias 본문은 저장소 최상위에서 출발한다
//    → 커밋 앞의 git 아닌 명령이 저장소 자체를 바꿀 수 있으면 위치에 표시한다(저장소 비교를 믿지 않게)
//    → 일반 alias는 git처럼 공백·따옴표·역슬래시로만 나눈다 / 펼친 모양을 확정할 수 없는 alias는 확정 불가다
//    → git commit이 아닌 명령이 만드는 커밋(cherry-pick·revert·am·commit-tree, merge·rebase 등의 --continue)은
//      무엇이 커밋될지 실행하면서 정해지므로 확정 불가다 — git이 받아들이는 줄임 옵션(--cont)과
//      am의 -n(커밋을 만드는 --no-verify)도 마찬가지다
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
    'git commit --dry-run -m x',
    'git cherry-pick --no-commit abc123',
    'git cherry-pick -n abc123',
    'git revert --abort',
    'git cherry-pick --quit',
    'git am --show-current-patch',
    'git rebase --abort',
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
    // 전역 옵션 뜻 풀이는 스테이징 가늠과 같은 함수(gitGlobalEffects) — -C ~·--config-env 저장소 바꿈 (M1)
    'git -C ~/x commit -m x',
    'git --config-env core.worktree=E commit -m x',
    'git --config-env=core.worktree=E commit -am x',
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

describe('git commit이 아닌 명령이 만드는 커밋 [규칙: 확정할 수 없으면 통과시키지 않는다]', () => {
  const cases = [
    'git cherry-pick abc123',
    'git revert HEAD',
    'git am 0001-fix.patch',
    'git commit-tree abc123 -m x',
    'git update-ref refs/heads/main $(git commit-tree HEAD^{tree} -p HEAD -m x)',
    'git merge --continue',
    'git rebase --continue',
    'git cherry-pick --continue',
    'git -C . cherry-pick abc123',
    'git am -n 0001-fix.patch',
    'git am --no-verify 0001-fix.patch',
    'git rebase --cont',
    'git merge --conti',
    'git am --cont',
  ];
  for (const cmd of cases) {
    it(`unresolved: ${label(cmd)}`, async () => {
      expect((await planCommit(cmd, noAlias)).kind).toBe('unresolved');
    });
  }
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

// 확정하지 못한 계획에도 커밋 위치(확정 여부 포함)를 싣는다 — 위치 불명과 "위치는 알지만 파일을 모름"을 가른다 (F1)
// [규칙: 문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다 — 확정할 수 없으면 강도에 맞춰 대응]
describe('커밋 위치 [규칙: 문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다]', () => {
  const locationsOf = async (cmd: string) => {
    const plan = await planCommit(cmd, noAlias);
    return plan.kind === 'unresolved' ? plan.locations : 'not-unresolved';
  };
  const known: [string, unknown][] = [
    ['git add -A && git ' + 'commit -m x', [{ known: true }]],
    ['git add -A && git ' + 'commit -m "update source files"', [{ known: true }]],
    ['cd /o && git add -A && git ' + 'commit -m x', [{ known: true, cwd: '/o' }]],
    ['git -C sub add -A && git -C sub ' + 'commit -m x', [{ known: true, cwd: 'sub' }]],
    [
      'git ' + 'commit -m a && git -C /o ' + 'commit -m b',
      [{ known: true }, { known: true, cwd: '/o' }],
    ],
    ["sh -c 'cd /o' && git add -A && git " + 'commit -m x', [{ known: true }]],
    // 괄호 서브셸 안 cd는 따라간다 (G9)
    ['(cd /o && git add -A && git ' + 'commit -m x)', [{ known: true, cwd: '/o' }]],
    // git 명령(스테이징)은 저장소를 바꾸지 못한다 — 저장소 비교를 그대로 쓴다 (G1)
    ['cd v && git add -A && git ' + 'commit -m x', [{ known: true, cwd: 'v' }]],
    // git이 아닌 명령이 앞서면 저장소가 바뀔 수 있다 — 위치에 표시해 다른 저장소로 단정하지 않게 한다 (G1)
    [
      'cd v && rm -rf .git && git ' + 'commit -am x',
      [{ known: true, cwd: 'v', repoMayChange: true }],
    ],
    [
      'rm -rf v/.git && cd v && git add -A && git ' + 'commit -m x',
      [{ known: true, cwd: 'v', repoMayChange: true }],
    ],
    ['git cherry-pick abc', [{ known: true }]],
  ];
  for (const [cmd, expected] of known) {
    it(`위치를 안다: ${label(cmd)}`, async () => {
      expect(await locationsOf(cmd)).toEqual(expected);
    });
  }
  const unknown = [
    'source ./env.sh && git ' + 'commit -m x',
    '. ./env.sh && git ' + 'commit -m x',
    '$CMD && git ' + 'commit -m x',
    'cd ~/x && git add -A && git ' + 'commit -m x',
    'GIT_DIR=/o/.git git ' + 'commit -m x',
    'GIT_INDEX_FILE=/o/i git add -A && GIT_INDEX_FILE=/o/i git ' + 'commit -m x',
    'export GIT_WORK_TREE=/o; git ' + 'commit -m x',
    'git --git-dir=/o/.git ' + 'commit -m x',
    'git -c core.worktree=/o ' + 'commit -m x',
    'git ls-files | xargs git ' + 'commit -m x',
  ];
  for (const cmd of unknown) {
    it(`위치 불명: ${label(cmd)}`, async () => {
      expect(await locationsOf(cmd)).toBeUndefined();
    });
  }
});

// 줄바꿈이 든 alias 값·여러 구간으로 읽히는 alias는 펼친 모양을 확정할 수 없다 (F2)
// [규칙: 확정할 수 없으면 통과시키지 않는다]
describe('판단할 수 없는 alias [규칙: 확정할 수 없으면 통과시키지 않는다]', () => {
  for (const cmd of [
    "git -c 'alias.ci=commit\n-a' ci -m x",
    // git은 일반 alias를 셸 연산자로 나누지 않는다 — ';'는 commit의 알 수 없는 옵션 글자가 된다 (G4-a)
    "git -c 'alias.ci=commit -a;x' ci -m x",
    // 닫히지 않은 따옴표는 git이 거절한다 — 펼친 모양을 확정할 수 없다
    "git -c 'alias.ci=commit -m \"x' ci",
  ]) {
    it(`unresolved: ${label(cmd)}`, async () => {
      expect((await planCommit(cmd, noAlias)).kind).toBe('unresolved');
    });
  }
  it('저장소 설정의 alias 값에 줄바꿈이 있어도 확정 불가다', async () => {
    const resolveAlias = async (name: string) => (name === 'ci' ? 'commit\n-a' : null);
    expect((await planCommit('git ci -m x', { resolveAlias })).kind).toBe('unresolved');
  });
});

const PLAIN = { kind: 'commit', scope: 'index', pathspecs: [] };

// cd는 커밋과 같은 && 사슬에서 커밋보다 앞에 올 때만 위치를 확정한다 — 조건부·파이프·백그라운드 cd를 무조건
// 적용하면 다른 저장소로 잘못 단정한다 (G2) [규칙: 확정할 수 없으면 통과시키지 않는다]
describe('조건부·파이프·백그라운드 cd [규칙: 확정할 수 없으면 통과시키지 않는다]', () => {
  const C = 'git ' + 'commit -m x';
  for (const cmd of [
    `false && cd ../other; ${C}`,
    `test -d /x && cd ../other; ${C}`,
    `git diff --quiet || cd ../other; ${C}`,
    `true || cd ../other; ${C}`,
    `false && cd ../other; git add -A && ${C}`,
    `git status && cd ../other; ${C}`,
    `cat x | cd ../other; ${C}`,
    `if test -d x; then cd ../other; fi; ${C}`,
    `cd ../other && true & ${C}`,
  ]) {
    it(`위치 불명: ${label(cmd)}`, async () => {
      const plan = await planCommit(cmd, noAlias);
      expect(plan.kind).toBe('unresolved');
      if (plan.kind === 'unresolved') expect(plan.locations).toBeUndefined();
    });
  }
  for (const cmd of [`cd ../other | cat; ${C}`, `cd ../other & ${C}`]) {
    it(`다른 프로세스의 cd는 위치를 바꾸지 않는다: ${label(cmd)}`, async () => {
      expect(await planCommit(cmd, noAlias)).toEqual(PLAIN);
    });
  }
  for (const cmd of [`cd ../other && ${C}`, `cd ../other; ${C}`, `false && cd ../other && ${C}`]) {
    it(`같은 사슬의 cd는 확정: ${label(cmd)}`, async () => {
      expect(await planCommit(cmd, noAlias)).toMatchObject({ kind: 'commit', cwd: '../other' });
    });
  }
});

// 괄호 서브셸 안 cd는 따라가고 괄호가 닫히면 되돌린다 (G9) [규칙: 커밋에 실제로 들어갈 파일 기준]
describe('괄호 서브셸 [규칙: 문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다]', () => {
  const C = 'git ' + 'commit';
  it('(cd X && git commit)은 cd X && git commit과 같게 판정한다', async () => {
    const inside = await planCommit(`(cd ../other && ${C} -am x)`, noAlias);
    expect(inside).toEqual(await planCommit(`cd ../other && ${C} -am x`, noAlias));
    expect(inside).toMatchObject({ kind: 'commit', scope: 'all', cwd: '../other' });
  });
  it('닫힌 서브셸의 cd는 뒤 커밋에 남지 않는다', async () => {
    expect(await planCommit(`(cd a); (${C} -m x)`, noAlias)).toEqual(PLAIN);
  });
  it('서브셸 안 커밋도 동시에 도는 뒤 명령이 있으면 확정 불가다', async () => {
    expect((await planCommit(`(${C} -m x) & rm -rf src`, noAlias)).kind).toBe('unresolved');
    expect((await planCommit(`(${C} -m x) | git add -A`, noAlias)).kind).toBe('unresolved');
  });
  it('서브셸 안 저장소 환경 변수 지정도 뒤 git에 닿는다', async () => {
    expect((await planCommit(`(GIT_DIR=/o/.git; ${C} -m x)`, noAlias)).kind).toBe('unresolved');
  });
});

// 셸 alias(!…) 본문은 git이 저장소 최상위에서 실행한다 (G3) [규칙: 커밋에 실제로 들어갈 파일 기준]
describe('셸 alias의 출발 위치 [규칙: 문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다]', () => {
  const C = 'git ' + 'commit';
  const withAlias = (value: string) => ({
    resolveAlias: async (name: string) => (name === 'ci' ? value : null),
  });
  it('본문의 커밋은 부른 위치의 저장소 최상위에서 실행된다', async () => {
    const deps = withAlias(`!${C} docs/x.json -m x`);
    expect(await planCommit('git ci', deps)).toEqual({
      kind: 'commit',
      scope: 'only',
      pathspecs: ['docs/x.json'],
      top: true,
    });
    expect(await planCommit('cd src && git ci', deps)).toMatchObject({ cwd: 'src', top: true });
    expect(await planCommit('git -C sub ci', deps)).toMatchObject({ cwd: 'sub', top: true });
  });
  it('최상위를 모르는 채 상대 위치로 옮기면 위치 불명, 절대 위치면 다시 정해진다', async () => {
    const rel = await planCommit('git ci', withAlias(`!cd sub && ${C} -m x`));
    expect(rel.kind).toBe('unresolved');
    expect(await planCommit('git ci', withAlias(`!cd /abs && ${C} -m x`))).toEqual({
      ...PLAIN,
      cwd: '/abs',
    });
  });
});

// 일반 alias 값은 git처럼 공백·따옴표·역슬래시로만 나눈다 (G4-a) [규칙: 커밋에 실제로 들어갈 파일 기준]
describe('일반 alias 나누기 [규칙: 문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다]', () => {
  for (const value of ['log --format=%h|%s', 'log --format=%C(auto)%h%d', 'log --oneline && x']) {
    it(`셸 연산자 글자가 든 커밋 아닌 alias는 커밋이 아니다: ${value}`, async () => {
      const deps = { resolveAlias: async (n: string) => (n === 'lp' ? value : null) };
      expect((await planCommit('git lp', deps)).kind).toBe('none');
    });
  }
  it('따옴표로 묶인 인자를 한 낱말로 읽는다', async () => {
    const deps = { resolveAlias: async (n: string) => (n === 'ci' ? 'commit -m "a b" -a' : null) };
    expect(await planCommit('git ci', deps)).toMatchObject({ kind: 'commit', scope: 'all' });
  });
});

// 위치를 바꾸는 래퍼 옵션(sudo -D/--chdir/-i) 뒤의 커밋은 위치 불명 (G5) [규칙: 확정할 수 없으면 통과시키지 않는다]
describe('위치를 바꾸는 래퍼 [규칙: 확정할 수 없으면 통과시키지 않는다]', () => {
  const C = 'git ' + 'commit -m x';
  for (const cmd of [
    `sudo -D /o ${C}`,
    `sudo -D/o ${C}`,
    `sudo --chdir=/o ${C}`,
    `sudo --chdir /o ${C}`,
    `sudo -i ${C}`,
  ]) {
    it(`위치 불명: ${label(cmd)}`, async () => {
      const plan = await planCommit(cmd, noAlias);
      expect(plan.kind).toBe('unresolved');
      if (plan.kind === 'unresolved') expect(plan.locations).toBeUndefined();
    });
  }
  it('위치를 바꾸지 않는 래퍼는 그대로 확정한다', async () => {
    expect(await planCommit(`sudo -u me ${C}`, noAlias)).toEqual(PLAIN);
  });
});
