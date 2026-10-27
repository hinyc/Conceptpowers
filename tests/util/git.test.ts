// @concept:governance-mode
// tests/util/git.test.ts
// 문지기·결산이 쓰는 git 호출 래퍼를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 불변 "문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다"
//    → 비ASCII 경로도 따옴표로 바뀌지 않은 원본 그대로 받는다(그래야 그 파일을 실제로 열어 검사한다)
//    → diff.relative 사용자 설정이 있어도 저장소 전체 기준 경로를 받는다
//    → 실패를 삼키는 호출(tryGit)은 null, 던지는 호출(git)은 던진다 — 호출자가 대응을 고른다
//    → 표준 입력으로 목록을 넘길 수 있다(경로가 많아도 인자 길이 한도에 걸리지 않게)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { git, tryGit, isGitRepo } from '../../src/util/git.js';

let dir: string;
const run = (args: string[], cwd = dir): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cp-git-'));
  run(['init', '-q']);
  run(['config', 'user.email', 't@t']);
  run(['config', 'user.name', 't']);
  run(['config', 'commit.gpgsign', 'false']);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('git 래퍼', () => {
  it('비ASCII 경로를 따옴표 없이 원본 그대로 돌려준다', async () => {
    writeFileSync(join(dir, '認証.ts'), 'a\n');
    run(['add', '.']);
    run(['commit', '-qm', 'init']);
    writeFileSync(join(dir, '認証.ts'), 'b\n');
    const out = await git(dir, ['diff', '--name-only']);
    expect(out.trim()).toBe('認証.ts');
  });

  it('diff.relative 설정이 있어도 하위 폴더에서 저장소 전체 기준 경로를 받는다', async () => {
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', 'a.ts'), 'a\n');
    writeFileSync(join(dir, 'top.ts'), 'a\n');
    run(['add', '.']);
    run(['commit', '-qm', 'init']);
    run(['config', 'diff.relative', 'true']);
    writeFileSync(join(dir, 'sub', 'a.ts'), 'b\n');
    writeFileSync(join(dir, 'top.ts'), 'b\n');
    const out = await git(join(dir, 'sub'), ['diff', '--name-only']);
    expect(out.trim().split('\n').sort()).toEqual(['sub/a.ts', 'top.ts']);
  });

  it('git은 실패하면 던지고 tryGit은 null을 돌려준다', async () => {
    await expect(git(dir, ['rev-parse', '--verify', 'no-such-ref'])).rejects.toThrow();
    expect(await tryGit(dir, ['rev-parse', '--verify', 'no-such-ref'])).toBeNull();
  });

  it('표준 입력으로 내용을 넘길 수 있다', async () => {
    const id = await git(dir, ['hash-object', '--stdin'], { input: 'hello\n' });
    expect(id.trim()).toMatch(/^[0-9a-f]{40,64}$/);
  });

  it('isGitRepo는 저장소면 참, 아니면 거짓', async () => {
    expect(await isGitRepo(dir)).toBe(true);
    const plain = mkdtempSync(join(tmpdir(), 'cp-plain-'));
    try {
      expect(await isGitRepo(plain)).toBe(false);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});
