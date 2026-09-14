// @concept:drift-reconcile
// tests/drift/reconcileCommitted.test.ts
// 결산이 무시함 기록에 함께 남기는 코드무관 사유가 커밋에 정착한 기록에서만 오는지 실제 git 저장소로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - drift-reconcile 불변 "결산이 무시함 기록에 함께 남기는 코드무관 사유는 커밋에 정착한 기록뿐이다 — 커밋되지
//    않은 기록은 통과 근거로 남지 않는다"
//    → 개념 문서만 커밋되고 코드무관 기록은 디스크에만 있으면 무시함은 사유 없이(noCode=false) 남는다
//    → 코드무관 기록이 같은 커밋에 들어가면 무시함에 사유가 함께 남는다(noCode=true)
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reconcileAfterCommit } from '../../src/drift/reconcile.js';
import { recordNoCode } from '../../src/drift/noCode.js';
import { readHistory } from '../../src/drift/history.js';
import { writeLock } from '../../src/drift/lock.js';
import { contractHash } from '../../src/drift/hash.js';
import { writeMappingCache } from '../../src/mapping/scan.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { writeConcept, readConcept } from '../../src/store/conceptStore.js';

const DOC = 'docs/conceptpowers/concepts/data/auth-token.json';
const NOCODE = 'docs/conceptpowers/concepts/.alignment/no-code.json';
let root: string;
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=T', ...args], { cwd: root });
const body = (definition: string) => ({
  slug: 'auth-token',
  category: ['behavior'],
  title: 'A',
  description: { definition },
  purpose: { reason: 'r' },
  actions: {},
  principle: { immutableRules: ['결제 완료 후 price 변경 불가'] },
});

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'cp-reconcile-git-'));
  await scaffoldInit(root, {});
  await writeConcept(root, body('v1'));
  const v1 = await readConcept(root, 'auth-token');
  await writeLock(root, {
    'auth-token': { hash: contractHash(v1!), at: '2026-01-01T00:00:00.000Z' },
  });
  await writeMappingCache(root, { 'auth-token': ['src/a.ts'] });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/a.ts'), '// @concept:auth-token\nexport const a = 1;\n');
  git('init', '-q');
  git('add', '-A');
  git('commit', '-qm', 'base');
  await writeConcept(root, body('v2'));
  await recordNoCode(
    root,
    (await readConcept(root, 'auth-token'))!,
    '문구 정리만 — 코드 영향 없음'
  );
});

async function lastEntry() {
  return (await readHistory(root)).filter((e) => e.slug === 'auth-token').at(-1);
}

describe('결산의 코드무관 사유는 커밋에 정착한 기록에서만 온다', () => {
  it('기록이 디스크에만 있으면 무시함은 사유 없이 남는다 [규칙: 커밋되지 않은 기록은 통과 근거로 남지 않는다]', async () => {
    git('add', DOC);
    git('commit', '-qm', 'doc');
    const r = await reconcileAfterCommit(root, [DOC], 't2');
    expect(r.ignored).toContain('auth-token');
    expect((await lastEntry())?.noCode).toBe(false);
  });
  it('기록이 같은 커밋에 들어가면 무시함에 사유가 함께 남는다 [규칙: 커밋에 정착한 기록]', async () => {
    git('add', DOC, NOCODE);
    git('commit', '-qm', 'doc+record');
    const r = await reconcileAfterCommit(root, [DOC, NOCODE], 't2');
    expect(r.ignored).toContain('auth-token');
    const entry = await lastEntry();
    expect(entry?.noCode).toBe(true);
    expect(entry?.note).toContain('문구 정리만');
  });
});
