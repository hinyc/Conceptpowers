// @concept:governance-mode @concept:drift-reconcile
// tests/hooks/commitFiles.test.ts
// 커밋 계획(범위)에 따라 실제로 커밋될 파일 목록을 계산하는 resolveCommitFiles를 실제 git 저장소로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 불변 "문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다"
//    → index: 스테이징된 파일만 / all(-a): 스테이징 + 추적 중인 파일의 미스테이징 변경(새 파일 제외)
//    → only(경로 지정): 지정 경로의 변경만(다른 스테이징 파일 제외) / include(-i): 스테이징 + 지정 경로의 변경
//  - drift-reconcile 불변 "커밋 전 문지기의 판정과 커밋 뒤 결산은 같은 잣대로 맞물림과 따라옴을 판정한다"
//    → 계산한 목록이 실제 커밋 결과(git diff-tree)와 일치한다(-a 커밋으로 대조)
//  - governance-mode 불변 "… 확정할 수 없으면 검사를 마친 것처럼 통과시키지 않는다"
//    → git이 목록을 못 읽으면 빈 목록이 아니라 예외
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveCommitFiles } from '../../src/hooks/command/commitFiles.js';

let root: string;
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', ...args], {
    cwd: root,
    encoding: 'utf8',
  });
const write = (rel: string, body: string) => {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), body);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-files-'));
  git('init', '-q');
  write('src/a.ts', 'a1\n');
  write('src/b.ts', 'b1\n');
  write('src/c.ts', 'c1\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  // 상태: a는 스테이징, b는 미스테이징 수정, c는 그대로, new는 추적 안 됨
  write('src/a.ts', 'a2\n');
  git('add', 'src/a.ts');
  write('src/b.ts', 'b2\n');
  write('src/new.ts', 'n\n');
});

const plan = (scope: 'index' | 'all' | 'only' | 'include', pathspecs: string[] = []) => ({
  kind: 'commit' as const,
  scope,
  pathspecs,
});

describe('resolveCommitFiles', () => {
  it('index: 스테이징된 파일만 [규칙: 실제로 들어갈 파일 기준]', async () => {
    expect(await resolveCommitFiles(root, plan('index'))).toEqual(['src/a.ts']);
  });

  it('all(-a): 스테이징 + 추적 파일의 미스테이징 변경, 새 파일은 제외 [규칙: 실제로 들어갈 파일 기준]', async () => {
    expect((await resolveCommitFiles(root, plan('all'))).sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('only(경로 지정): 지정한 경로의 변경만 — 다른 스테이징 파일은 빠진다 [규칙: 실제로 들어갈 파일 기준]', async () => {
    expect(await resolveCommitFiles(root, plan('only', ['src/b.ts']))).toEqual(['src/b.ts']);
  });

  it('only(경로 없음, --amend -o): 새 변경을 넣지 않으므로 빈 목록 [규칙: 실제로 들어갈 파일 기준]', async () => {
    expect(await resolveCommitFiles(root, plan('only', []))).toEqual([]);
  });

  it('include(-i): 스테이징 + 지정한 경로의 변경 [규칙: 실제로 들어갈 파일 기준]', async () => {
    expect((await resolveCommitFiles(root, plan('include', ['src/b.ts']))).sort()).toEqual([
      'src/a.ts',
      'src/b.ts',
    ]);
  });

  it('-a로 계산한 목록은 실제 커밋 결과와 같다 [규칙: 커밋 전 판정과 커밋 뒤 결산은 같은 잣대]', async () => {
    const predicted = (await resolveCommitFiles(root, plan('all'))).sort();
    git('commit', '-q', '-a', '-m', 'all');
    const actual = git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD')
      .split('\n')
      .filter(Boolean)
      .sort();
    expect(predicted).toEqual(actual);
  });

  it('git이 목록을 읽지 못하면 빈 목록 대신 예외를 던진다 [규칙: 확정할 수 없으면 통과시키지 않는다]', async () => {
    const bare = mkdtempSync(join(tmpdir(), 'cp-nogit-'));
    await expect(resolveCommitFiles(bare, plan('index'))).rejects.toThrow();
  });
});
