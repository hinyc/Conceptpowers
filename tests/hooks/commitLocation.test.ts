// @concept:governance-mode
// tests/hooks/commitLocation.test.ts
// 커밋이 실행될 위치(명령을 파싱해 얻은 위치)의 git 저장소가 이 프로젝트 저장소인지로 문지기 판단 여부를 가린다 —
// 실제 git 저장소(밖의 저장소·중첩 저장소·worktree·모노레포·저장소 아닌 폴더)로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 불변 "문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다 — 명령을 실행하기 전에
//    그 파일들을 확정할 수 없으면 검사를 마친 것처럼 통과시키지 않고 강도에 맞춰 대응한다"
//    → 다른 저장소(밖·중첩·다른 worktree)의 커밋은 이 프로젝트 파일을 담지 않는다 — 명시 cd·git -C든 훅 작업
//      폴더든, 커밋 메시지·옵션 글자(cd·source·eval·-C HEAD·-c user.email)와 무관하게 판단하지 않는다
//    → 같은 저장소면 루트 밖 위치(모노레포 형제 폴더)여도 이 프로젝트 커밋이다 — 루트 안에서와 같게 판정한다
//    → 위치를 확정할 수 없거나(source·셸 확장·저장소를 바꾸는 환경 변수) 위치는 알지만 git이 답하지 못하면(저장소
//      아닌 폴더) 확정 불가다
//    → 커밋이 여럿이면 하나라도 이 프로젝트·불명이면 판단하고, 전부 다른 저장소일 때만 판단하지 않는다
//    → 다른 저장소 판정은 확실할 때만: 커밋 앞의 git 아닌 명령이 저장소를 바꿀 수 있거나(vendoring) 조건부 cd·위치를
//      바꾸는 래퍼(sudo -D) 뒤면 확정 불가 / 파이프·백그라운드 cd는 위치를 바꾸지 않고, 괄호 서브셸 cd는 따라간다
//    → 셸 alias 본문의 경로는 저장소 최상위 기준 / 루트 밖 위치의 경로 지정은 루트 기준 상대 경로로 풀어 같게 판정한다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decidePreToolUse } from '../../src/hooks/preToolUse.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { pendingOptionsAt } from '../../src/hooks/command/stagingReach.js';
import { createRepoLocator } from '../../src/hooks/command/commitLocation.js';

const INIT = 'docs/conceptpowers/init.json';
const C = 'git ' + 'commit -m x';
const UNRESOLVED = 'COMMIT UNRESOLVED';

const gitIn = (dir: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=T', ...args], {
    cwd: dir,
    encoding: 'utf8',
  });

// 루트(초기화된 프로젝트)를 만들고, 판단하면 반드시 묻게 되는 스테이징된 설정 변경을 둔다.
async function makeProject(dir: string, repo: string): Promise<void> {
  mkdirSync(join(dir, 'src'), { recursive: true });
  await scaffoldInit(dir, { locale: 'ko' });
  writeFileSync(join(dir, 'src/a.ts'), '// @concept:none\nexport const a = 1;\n');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'add', '-f', join(dir, INIT));
  gitIn(repo, 'commit', '-qm', 'base');
  const p = join(dir, INIT);
  const cfg = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
  writeFileSync(p, JSON.stringify({ ...cfg, testGlobs: ['x/**'] }, null, 2) + '\n');
  gitIn(repo, 'add', '-f', p);
}

function makeOtherRepo(): string {
  const other = mkdtempSync(join(tmpdir(), 'cp-loc-other-'));
  gitIn(other, 'init', '-q');
  writeFileSync(join(other, 'f.txt'), '1\n');
  gitIn(other, 'add', 'f.txt');
  gitIn(other, 'commit', '-qm', 'o');
  writeFileSync(join(other, 'f.txt'), '2\n');
  return other;
}

const reasonOf = (r: Awaited<ReturnType<typeof decidePreToolUse>>): string =>
  `${r?.hookSpecificOutput.permissionDecisionReason ?? ''} ${r?.hookSpecificOutput.additionalContext ?? ''}`;

describe('커밋 위치의 저장소로 가린다 [규칙: 문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다]', () => {
  let root: string;
  let other: string;
  const run = (command: string, cwd: string | null) =>
    decidePreToolUse(root, { tool: 'Bash', input: { command }, cwd });

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'cp-loc-'));
    gitIn(root, 'init', '-q');
    await makeProject(root, root);
    other = makeOtherRepo();
  });

  // F1-a: 명령 날 글자의 낱말(cd·source·eval·-C·/i)을 위치 이동으로 오인하지 않는다
  const foreignFromOther = [
    `git add -A && git commit -m "update source files"`,
    `git add -A && git commit -m "fix eval loop"`,
    `git add . && git commit -m "ci: run cd pipeline"`,
    'git commit -C HEAD',
    'git add -A && git commit -C HEAD',
    `git -c user.email=a@b add -A && ${C}`,
    `git -c user.email=a@b ${C.slice(4)}`,
  ];
  for (const shape of foreignFromOther) {
    it(`밖의 저장소에서 ${shape} → 판단하지 않는다`, async () => {
      expect(await run(shape, other)).toBeNull();
    });
  }

  // F1-b·d: 명시적으로 다른 저장소를 가리켜도(절대경로 cd·git -C, 중첩 저장소 cd) 판단하지 않는다
  it('밖에서 절대경로 cd로 같은 밖의 저장소를 가리킨 커밋 → 판단하지 않는다', async () => {
    expect(await run(`cd ${other} && ${C}`, other)).toBeNull();
    expect(await run(`git -C ${other} ${C.slice(4)}`, other)).toBeNull();
  });
  it('루트에서 cd·git -C로 밖의 저장소를 가리킨 커밋 → 판단하지 않는다', async () => {
    expect(await run(`cd ${other} && git add -A && ${C}`, root)).toBeNull();
    expect(await run(`git -C ${other} ${C.slice(4)}`, root)).toBeNull();
  });
  it('루트에서 중첩 저장소로 cd한 커밋은 스테이징이 앞서도 판단하지 않는다 (F1-d)', async () => {
    const nested = join(root, 'vendor/lib');
    mkdirSync(nested, { recursive: true });
    gitIn(nested, 'init', '-q');
    writeFileSync(join(nested, 'n.txt'), 'n\n');
    gitIn(nested, 'add', 'n.txt');
    gitIn(nested, 'commit', '-qm', 'n');
    expect(await run(`cd vendor/lib && ${C}`, root)).toBeNull();
    expect(await run(`cd vendor/lib && git add -A && ${C}`, root)).toBeNull();
    expect(
      await run(`git -C vendor/lib add -A && git -C vendor/lib ${C.slice(4)}`, root)
    ).toBeNull();
  });

  it('밖에서도 cd로 루트를 가리키면 판단한다', async () => {
    expect(reasonOf(await run(`cd ${root} && git add -A && ${C}`, other))).toContain('init.json');
  });

  // 위치 불명은 확정 불가
  for (const shape of [
    `GIT_INDEX_FILE=${'$P'}/.git/index ${C}`,
    `source ./env.sh && git add -A && ${C}`,
    `. ./env.sh && ${C}`,
    `$CMD && git add -A && ${C}`,
    `cd ~/x && ${C}`,
  ]) {
    it(`밖의 저장소에서도 위치를 확정할 수 없는 ${shape} → 확정 불가`, async () => {
      expect(reasonOf(await run(shape, other))).toContain(UNRESOLVED);
    });
  }

  it('하위 셸(sh -c)의 cd는 뒤 커밋의 위치를 바꾸지 않는다', async () => {
    expect(reasonOf(await run(`sh -c 'cd ${other}' && git add -A && ${C}`, root))).toContain(
      'init.json'
    );
  });

  it('위치는 알지만 git이 답하지 못하는 폴더(저장소 아님)의 커밋 → 확정 불가', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'cp-loc-plain-'));
    expect(reasonOf(await run(C, plain))).toContain(UNRESOLVED);
  });

  // G1: 저장소 비교는 실행 전 디스크로 한다 — 커밋 앞의 git 아닌 명령이 저장소를 바꿀 수 있으면 다른 저장소로 단정하지 않는다
  it('중첩 저장소를 지우는 명령이 앞서면 다른 저장소로 단정하지 않는다 (vendoring)', async () => {
    const nested = join(root, 'vendor/lib');
    mkdirSync(nested, { recursive: true });
    gitIn(nested, 'init', '-q');
    for (const shape of [
      `cd vendor/lib && rm -rf .git && git add . && ${C}`,
      `rm -rf vendor/lib/.git && cd vendor/lib && git add -A && ${C}`,
      `cd vendor/lib && rm -rf .git && ${C.replace('-m', '-am')}`,
      `mv ${nested}/.git /tmp/zz && git -C ${nested} ${C.slice(4)}`,
    ]) {
      expect(reasonOf(await run(shape, root))).toContain(UNRESOLVED);
    }
    // git 명령(스테이징)만 앞서면 저장소는 그대로다
    expect(await run(`cd vendor/lib && git add -A && ${C}`, root)).toBeNull();
  });

  // G2: 조건부 cd는 뒤 커밋의 위치를 확정하지 않는다 / 파이프·백그라운드의 cd는 위치를 바꾸지 않는다
  for (const shape of [
    `false && cd OTHER; ${C}`,
    `git diff --quiet || cd OTHER; ${C}`,
    `false && cd OTHER; git add -A && ${C}`,
  ]) {
    it(`조건부 cd 뒤 커밋(${shape}) → 다른 저장소로 단정하지 않는다`, async () => {
      expect(reasonOf(await run(shape.replace('OTHER', other), root))).toContain(UNRESOLVED);
    });
  }
  for (const shape of [`cd OTHER | cat; ${C}`, `cd OTHER & ${C}`]) {
    it(`다른 프로세스의 cd 뒤 커밋(${shape}) → 원래 위치에서 판정한다`, async () => {
      expect(reasonOf(await run(shape.replace('OTHER', other), root))).toContain('init.json');
    });
  }

  // G9: 괄호 서브셸 안 cd도 따라간다
  it('(cd 다른저장소 && git commit)은 cd 다른저장소 && git commit과 같다', async () => {
    expect(await run(`(cd ${other} && ${C.replace('-m', '-am')})`, root)).toBeNull();
    expect(reasonOf(await run(`(cd ${other}); ${C}`, root))).toContain('init.json');
  });

  // G3: 셸 alias 본문은 저장소 최상위에서 실행된다 — 하위 폴더에서 불러도 본문의 경로는 최상위 기준
  it('하위 폴더에서 부른 셸 alias의 경로 지정 커밋은 최상위 기준 경로로 검사한다', async () => {
    const alias = `alias.ci='!git ${'commit'} ${INIT} -m x'`;
    expect(reasonOf(await run(`git -c ${alias} ci`, join(root, 'src')))).toContain('init.json');
  });

  // G5: 위치를 바꾸는 래퍼 옵션 뒤의 커밋은 위치 불명
  it('sudo -D로 위치를 바꾼 커밋은 다른 저장소로 단정하지 않는다', async () => {
    expect(reasonOf(await run(`sudo -D ${root} ${C}`, other))).toContain(UNRESOLVED);
  });

  it('같은 저장소의 다른 worktree에서 하는 커밋은 판단하지 않는다', async () => {
    const wt = join(mkdtempSync(join(tmpdir(), 'cp-loc-wt-')), 'wt');
    gitIn(root, 'worktree', 'add', '-q', wt);
    expect(await run(`git add -A && ${C}`, wt)).toBeNull();
    expect(await run(C, wt)).toBeNull();
  });

  describe('커밋이 여럿', () => {
    it('하나라도 이 프로젝트 커밋이면 판단한다', async () => {
      expect(await run(`${C} && git -C ${other} ${C.slice(4)}`, root)).not.toBeNull();
      expect(
        await run(`git -C ${other} add -A && git -C ${other} ${C.slice(4)} && ${C}`, root)
      ).not.toBeNull();
    });
    it('전부 다른 저장소면 판단하지 않는다', async () => {
      expect(
        await run(`git -C ${other} ${C.slice(4)} && git -C ${other} ${C.slice(4)}`, root)
      ).toBeNull();
    });
  });

  describe('묻는 범위(pendingOptionsAt)도 같은 원리', () => {
    it('다른 저장소의 스테이징은 이 프로젝트의 디스크 변경을 담지 않는다', async () => {
      const opts = await pendingOptionsAt(
        `git -C ${other} add -A && ${C}`,
        root,
        root,
        createRepoLocator(root)
      );
      expect(opts.includeWorktree).toBe(false);
      expect(opts.configExplicit).toBe(false);
    });
    it('밖에서 절대경로 cd로 루트에 와 좁게 스테이징하면 좁게 본다 (F5)', async () => {
      const opts = await pendingOptionsAt(
        `cd ${root} && git add src/a.ts && ${C}`,
        root,
        other,
        createRepoLocator(root)
      );
      expect(opts.includeWorktree).toBe(false);
      expect(opts.configExplicit).toBe(false);
    });
    it('git이 답하지 못하는 밖의 위치는 넓게 본다', async () => {
      const plain = mkdtempSync(join(tmpdir(), 'cp-loc-plain-'));
      const opts = await pendingOptionsAt(
        `git add -A && ${C}`,
        root,
        plain,
        createRepoLocator(root)
      );
      expect(opts.includeWorktree).toBe(true);
    });
  });
});

// F1-c: 루트(init.json)가 모노레포의 하위 폴더일 때, 같은 저장소의 형제 폴더에서 친 커밋도 이 프로젝트 커밋이다
describe('모노레포 형제 폴더의 커밋 [규칙: 문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다]', () => {
  let mono: string;
  let root: string;
  let sibling: string;
  const run = (command: string, cwd: string | null) =>
    decidePreToolUse(root, { tool: 'Bash', input: { command }, cwd });

  beforeEach(async () => {
    mono = mkdtempSync(join(tmpdir(), 'cp-loc-mono-'));
    root = join(mono, 'pkgA');
    sibling = join(mono, 'pkgB');
    mkdirSync(root, { recursive: true });
    mkdirSync(sibling, { recursive: true });
    writeFileSync(join(sibling, 'b.txt'), 'b\n');
    gitIn(mono, 'init', '-q');
    await makeProject(root, mono);
    const p = join(root, INIT);
    const cfg = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
    writeFileSync(p, JSON.stringify({ ...cfg, enforcement: 'strict' }, null, 2) + '\n');
    gitIn(mono, 'add', '-f', p);
  });

  it('형제 폴더의 git commit은 루트에서 친 것과 같게 판정한다', async () => {
    const fromRoot = await run(C, root);
    const fromSibling = await run(C, sibling);
    expect(fromRoot).not.toBeNull();
    expect(fromSibling).toEqual(fromRoot);
  });
  it('형제 폴더의 git add -A && git commit은 확정 불가다(판단 없이 통과하지 않는다)', async () => {
    const r = await run(`git add -A && ${C}`, sibling);
    expect(r!.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(reasonOf(r)).toContain(UNRESOLVED);
  });
  it('형제 폴더에서 루트 안 파일을 지정한 커밋은 루트 기준 경로로 풀어 확정 검사한다', async () => {
    const r = await run(`${C} ../pkgA/src/a.ts`, sibling);
    expect(reasonOf(r)).not.toContain(UNRESOLVED);
  });
  // G6: 루트 밖으로 풀리는 경로도 루트 기준 상대 경로(../pkgB/b.txt)로 넘겨 루트 안에서 친 커밋과 같게 판정한다
  describe('루트 밖 위치의 경로 지정 커밋은 루트 안에서 친 것과 같다', () => {
    beforeEach(() => {
      writeFileSync(join(sibling, 'b.txt'), 'changed\n');
    });
    const same: [string, string, string][] = [
      ['형제 폴더 b.txt', `${C} b.txt`, `${C} ../pkgB/b.txt`],
      ['형제 폴더 .', `${C} .`, `${C} ../pkgB`],
      ['형제 폴더 :/pkgB', `${C} -- :/pkgB`, `${C} -- :/pkgB`],
    ];
    for (const [name, fromSibling, fromRoot] of same) {
      it(name, async () => {
        const expected = await run(fromRoot, root);
        expect(reasonOf(expected)).not.toContain(UNRESOLVED);
        expect(await run(fromSibling, sibling)).toEqual(expected);
      });
    }
    it('최상위에서 pkgB/b.txt·. 지정', async () => {
      expect(await run(`${C} pkgB/b.txt`, mono)).toEqual(await run(`${C} ../pkgB/b.txt`, root));
      const wide = await run(`${C} .`, mono);
      expect(reasonOf(wide)).not.toContain(UNRESOLVED);
      expect(wide).toEqual(await run(`${C} ..`, root));
    });
    it('git -C ../pkgB commit -- b.txt', async () => {
      expect(await run(`git -C ../pkgB ${C.slice(4)} -- b.txt`, root)).toEqual(
        await run(`${C} -- ../pkgB/b.txt`, root)
      );
    });
  });
});
