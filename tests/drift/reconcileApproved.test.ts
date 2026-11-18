// @concept:pending-diff @concept:drift-reconcile
// tests/drift/reconcileApproved.test.ts — 커밋 뒤 결산이 승인본도 정리하는지 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - pending-diff 수명 "개념이 사라지면 승인본도 함께 정리된다" → 없는 개념의 승인본을 지운다
//  - pending-diff 수명 "다시 확정되면 승인본은 정리된다" → 손으로 다시 정착한(지금 green인) 개념의 낡은 승인본을 지운다
//  - pending-diff 수명 "검토 중인 동안에는 … 승인본은 그대로 남는다" → pending·red 개념의 승인본은 지우지 않는다
//  - drift-reconcile 불변 "낡은 기록 정리는 결산에 딸린 일이다: 하나가 깨져도 결산은 성공한다"
//    → 지울 수 없는 승인본 하나가 있어도 결산과 나머지 정리는 계속되고 실패가 보고된다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reconcileAfterCommit } from '../../src/drift/reconcile.js';
import { writeConcept } from '../../src/store/conceptStore.js';
import { cpPaths } from '../../src/paths.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-rec-appr-'));
});
const mk = (slug: string, status: string) => ({
  slug,
  category: ['behavior'],
  title: slug,
  status,
  description: { definition: 'd' },
  purpose: { reason: 'r' },
  actions: {},
  principle: {},
});
const snap = (slug: string) => join(cpPaths(root).approvedDir, `${slug}.json`);
function plant(slug: string, content = '{ broken') {
  mkdirSync(cpPaths(root).approvedDir, { recursive: true });
  writeFileSync(snap(slug), content);
}

describe('reconcile의 승인본 정리', () => {
  it('없는 개념·green 개념의 승인본은 지우고 pending·red 것은 둔다', async () => {
    await writeConcept(root, mk('alive-green', 'green'));
    await writeConcept(root, mk('alive-pending', 'pending'));
    await writeConcept(root, mk('alive-red', 'red'));
    for (const s of ['alive-green', 'alive-pending', 'alive-red', 'gone-one']) plant(s);
    const r = await reconcileAfterCommit(root, []);
    expect(existsSync(snap('gone-one'))).toBe(false);
    expect(existsSync(snap('alive-green'))).toBe(false);
    expect(existsSync(snap('alive-pending'))).toBe(true);
    expect(existsSync(snap('alive-red'))).toBe(true);
    expect(r.pruned).toEqual(expect.arrayContaining(['gone-one', 'alive-green']));
    expect(r.pruneFailures).toEqual([]);
  });
  it('승인본 폴더가 없어도 결산은 정상이다', async () => {
    await writeConcept(root, mk('alive-green', 'green'));
    const r = await reconcileAfterCommit(root, []);
    expect(r.pruneFailures).toEqual([]);
  });
  it('지울 수 없는 항목이 있어도 결산과 나머지 정리는 계속된다', async () => {
    await writeConcept(root, mk('alive-green', 'green'));
    plant('alive-green');
    // 파일이 아닌 폴더라 지워지지 않는 항목
    mkdirSync(join(snap('stuck-one')), { recursive: true });
    writeFileSync(join(snap('stuck-one'), 'x'), '');
    plant('gone-one');
    const r = await reconcileAfterCommit(root, []);
    expect(existsSync(snap('alive-green'))).toBe(false);
    expect(existsSync(snap('gone-one'))).toBe(false);
    expect(r.pruneFailures).toHaveLength(1);
    expect(r.pruneFailures[0].file).toBe('docs/conceptpowers/concepts/.approved');
  });
});
