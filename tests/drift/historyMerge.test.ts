// @concept:drift-reconcile
// tests/drift/historyMerge.test.ts
// 결산 이력이 브랜치마다 쌓여도 합칠 때 충돌하지 않는지 실제 git 저장소로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - drift-reconcile 불변 "결산 이력은 기존 기록을 고쳐 쓰지 않고 새 기록을 더하기만 한다 — 브랜치마다 쌓인 이력이
//    합쳐질 때 서로 충돌하지 않게 한다"
//    → 두 브랜치가 각자 이력을 기록한 뒤 합쳐도 충돌 없이 합쳐지고, 합친 뒤 두 브랜치의 기록을 모두 읽는다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendHistory, readHistory } from '../../src/drift/history.js';

let root: string;
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=T', ...args], {
    cwd: root,
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    encoding: 'utf8',
  });

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'cp-history-merge-'));
  git('init', '-q', '-b', 'main');
  await appendHistory(root, {
    slug: 'base-rule',
    hash: '3:base',
    reason: '처음',
    at: '2026-01-01T00:00:00.000Z',
  });
  git('add', '-A');
  git('commit', '-qm', 'base');
});

describe('브랜치별 결산 이력 합치기', () => {
  it('두 브랜치가 각자 이력을 기록해도 충돌 없이 합쳐지고 양쪽 기록을 모두 읽는다 [규칙: 새 기록을 더하기만 한다]', async () => {
    git('checkout', '-q', '-b', 'feature');
    await appendHistory(root, {
      slug: 'pay-rule',
      hash: '3:feature',
      aligned: true,
      at: '2026-01-02T00:00:00.000Z',
    });
    git('add', '-A');
    git('commit', '-qm', 'feature record');

    git('checkout', '-q', 'main');
    await appendHistory(root, {
      slug: 'auth-rule',
      hash: '3:main',
      ignored: true,
      at: '2026-01-02T00:00:00.000Z',
    });
    git('add', '-A');
    git('commit', '-qm', 'main record');

    // 충돌이 나면 merge가 실패해 예외를 던진다.
    git('merge', '-q', '--no-edit', 'feature');
    expect(git('diff', '--name-only', '--diff-filter=U')).toBe('');

    const slugs = (await readHistory(root)).map((entry) => entry.slug);
    expect(slugs).toEqual(expect.arrayContaining(['base-rule', 'pay-rule', 'auth-rule']));
    expect(slugs).toHaveLength(3);
  });
});
