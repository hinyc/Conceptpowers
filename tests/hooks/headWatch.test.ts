// @concept:governance-mode @concept:drift-reconcile
// 커밋 명령으로 보이지 않던 명령이 실행 중에 만든 커밋을 사후에 알아내 결산하는지 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 불변 "어긋난 채 통과한 커밋은 강도와 무관하게 이력에 남는다"
//    → 스크립트 안에서 만들어진 커밋도 찾아내고, 커밋 명령이 아니었어도 결산한다
//  - drift-reconcile 불변 "결산은 커밋이 성공한 뒤에만 한다"
//    → 커밋 없이 HEAD만 옮긴 명령(reset·checkout)이나 아무것도 안 한 명령은 커밋으로 세지 않는다
//  - drift-reconcile 불변 "커밋 전 문지기의 판정과 커밋 뒤 결산은 같은 잣대로 판정한다"
//    → 문지기가 이미 본 커밋 명령은 문지기를 거치지 않은 커밋으로 알리지 않는다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  recordHeadBefore,
  takeUngatedCommits,
  ungatedCommitNotice,
} from '../../src/hooks/command/headWatch.js';
import {
  runPostToolUse,
  ungatedCommitFiles,
  ungatedCommitsOf,
} from '../../src/hooks/postToolUse.js';
import { scaffoldInit } from '../../src/init/scaffold.js';

let root: string;
const sh = (cmd: string) => execSync(cmd, { cwd: root, stdio: 'pipe' }).toString();

function commitFile(name: string, msg: string) {
  writeFileSync(join(root, name), msg);
  sh(`git add ${name}`);
  sh(`git commit -q -m "${msg}"`);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-hw-'));
  sh('git init -q');
  sh('git config user.email "t@t.com"');
  sh('git config user.name "T"');
  commitFile('a.txt', 'first');
});

describe('headWatch — 실행 중에 생긴 커밋 찾기', () => {
  it('스크립트 안에서 만들어진 커밋을 찾는다', async () => {
    await recordHeadBefore(root, 'toolu_1');
    commitFile('b.txt', 'from script');
    const found = await takeUngatedCommits(root, 'toolu_1');
    expect(found).toHaveLength(1);
    expect(found[0].subject).toBe('commit: from script');
    expect(found[0].sha).toBe(sh('git rev-parse HEAD').trim());
  });

  it('cherry-pick·amend로 만든 커밋도 센다', async () => {
    sh('git checkout -q -b side');
    commitFile('c.txt', 'side work');
    sh('git checkout -q -');
    await recordHeadBefore(root, 'toolu_2');
    sh('git cherry-pick side');
    sh('git commit -q --amend -m "amended"');
    const subjects = (await takeUngatedCommits(root, 'toolu_2')).map((c) => c.subject);
    expect(subjects).toEqual(['commit (amend): amended', 'cherry-pick: side work']);
  });

  it('충돌을 풀고 이어 간 rebase가 만든 커밋은 세고, 그대로 옮겨 심은 커밋은 세지 않는다', async () => {
    sh('git checkout -q -b side');
    commitFile('a.txt', 'side change');
    commitFile('d.txt', 'side extra');
    sh('git checkout -q -');
    commitFile('a.txt', 'main change');
    sh('git checkout -q side');
    await recordHeadBefore(root, 'toolu_rb');
    try {
      sh('git rebase main');
    } catch {
      /* a.txt 충돌로 멈춘다 */
    }
    writeFileSync(join(root, 'a.txt'), 'resolved');
    sh('git add a.txt');
    sh('GIT_EDITOR=true git rebase --continue');
    const subjects = (await takeUngatedCommits(root, 'toolu_rb')).map((c) => c.subject);
    expect(subjects).toEqual(['rebase (continue): side change']);
  });

  it('기준 항목이 지워져도 예전 커밋을 새 커밋으로 알리지 않는다', async () => {
    commitFile('b.txt', 'second');
    await recordHeadBefore(root, 'toolu_gone');
    sh('git reflog delete HEAD@{0}');
    expect(await takeUngatedCommits(root, 'toolu_gone')).toEqual([]);
  });

  it('기준 항목이 지워진 뒤에 생긴 커밋은 여전히 찾는다', async () => {
    await recordHeadBefore(root, 'toolu_gone2');
    sh('git reflog delete HEAD@{0}');
    writeFileSync(join(root, 'n.txt'), 'n');
    sh('git add n.txt');
    execSync('git commit -q -m later', {
      cwd: root,
      env: { ...process.env, GIT_COMMITTER_DATE: '2099-01-01T00:00:00Z' },
    });
    const subjects = (await takeUngatedCommits(root, 'toolu_gone2')).map((c) => c.subject);
    expect(subjects).toEqual(['commit: later']);
  });

  it('커밋 없이 HEAD만 옮긴 명령은 세지 않는다', async () => {
    commitFile('b.txt', 'second');
    await recordHeadBefore(root, 'toolu_3');
    sh('git reset -q --hard HEAD~1');
    sh('git checkout -q -b other');
    expect(await takeUngatedCommits(root, 'toolu_3')).toEqual([]);
  });

  it('아무 일도 없었거나 기록이 없으면 빈 목록이고, 기록은 한 번 쓰면 지워진다', async () => {
    expect(await takeUngatedCommits(root, 'toolu_none')).toEqual([]);
    await recordHeadBefore(root, 'toolu_4');
    expect(await takeUngatedCommits(root, 'toolu_4')).toEqual([]);
    await recordHeadBefore(root, 'toolu_5');
    commitFile('b.txt', 'later');
    expect(await takeUngatedCommits(root, 'toolu_5')).toHaveLength(1);
    expect(await takeUngatedCommits(root, 'toolu_5')).toEqual([]);
  });

  it('기록은 작업 트리가 아니라 git 폴더에 두어 커밋 대상이 되지 않는다', async () => {
    await recordHeadBefore(root, 'toolu_6');
    expect(sh('git status --porcelain')).toBe('');
  });

  it('안내는 문지기를 거치지 않았음과 되돌리지 말 것을 밝힌다', () => {
    const text = ungatedCommitNotice([{ sha: 'abcdef1234', subject: 'commit: release' }]);
    expect(text).toContain('abcdef1 commit: release');
    expect(text).toContain('문지기의 검사를 거치지 않았습니다');
    expect(text).toContain('되돌리지는 마세요');
  });
});

describe('사후 훅 — 문지기를 거치지 않은 커밋', () => {
  it('커밋 명령으로 보이지 않던 명령의 커밋만 알린다', async () => {
    await scaffoldInit(root, {});
    await recordHeadBefore(root, 'toolu_7');
    commitFile('b.txt', 'release');
    const found = await ungatedCommitsOf(root, 'Bash', 'toolu_7', { command: 'pnpm release' });
    expect(found.map((c) => c.subject)).toEqual(['commit: release']);

    await recordHeadBefore(root, 'toolu_8');
    commitFile('c.txt', 'gated');
    expect(await ungatedCommitsOf(root, 'Bash', 'toolu_8', { command: 'git commit -m x' })).toEqual(
      []
    );
  });

  it('초기화 전이거나 Bash가 아니면 보지 않는다', async () => {
    await recordHeadBefore(root, 'toolu_9');
    commitFile('b.txt', 'x');
    expect(await ungatedCommitsOf(root, 'Bash', 'toolu_9', { command: 'pnpm release' })).toEqual(
      []
    );
    expect(await ungatedCommitsOf(root, 'Edit', 'toolu_9', {})).toEqual([]);
  });

  it('실행 중 커밋이 여럿이면 마지막 하나가 아니라 모든 커밋의 파일을 결산 대상으로 모은다', async () => {
    commitFile('b.txt', 'one');
    const first = sh('git rev-parse HEAD').trim();
    commitFile('c.txt', 'two');
    const second = sh('git rev-parse HEAD').trim();
    const files = await ungatedCommitFiles(root, [
      { sha: second, subject: 'commit: two' },
      { sha: first, subject: 'commit: one' },
    ]);
    expect([...files].sort()).toEqual(['b.txt', 'c.txt']);
  });

  it('커밋 명령이 아니어도 실행 중 커밋이 있으면 결산한다', async () => {
    await scaffoldInit(root, {});
    commitFile('b.txt', 'release');
    const input = { command: 'pnpm release' };
    expect(await runPostToolUse(root, { tool: 'Bash', input })).toBeNull();
    const res = await runPostToolUse(root, {
      tool: 'Bash',
      input,
      ungatedCommits: [{ sha: sh('git rev-parse HEAD').trim(), subject: 'commit: release' }],
    });
    expect(res).not.toBeNull();
  });
});
