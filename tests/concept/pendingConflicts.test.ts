// @concept:init-gate @concept:settled-status
// 충돌 사유 기록(pendingConflicts)을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - settled-status 불변 "충돌로 확정을 미룰 때는 반드시 그 사유를 함께 기록한다"
//    → 사유를 기록하고 읽는다
//  - settled-status 불변 "확정되는 순간 남아 있던 충돌 사유 기록을 지운다"
//    → 해소하면 항목이 사라진다 / setConceptStatus → green 전환 시 자동 정리된다
//  - 상위 기준 문서 "갈아 끼우기 방식"의 구성요소 "대상: … 충돌 기록 …" → 기록이 없으면 빈 객체(깨진 값 대신 안전한 기본값)
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { scaffoldInit } from '../../src/init/scaffold.js';
import {
  readPendingConflictsStrict,
  setPendingConflict,
  clearPendingConflict,
  prunePendingConflicts,
} from '../../src/concept/pendingConflicts.js';
import { writeConcept, setConceptStatus } from '../../src/store/conceptStore.js';
import { recordAttest } from '../../src/concept/attest.js';
import { parseConcept } from '../../src/schema/concept.js';

const baseConcept = {
  slug: 'test-concept',
  category: ['feature'],
  title: 'Test Concept',
  description: { definition: 'd' },
  purpose: { reason: 'r' },
  actions: {},
  state: { managed: ['이 개념이 관리하는 대상'] },
  principle: {
    immutableRules: ['이 개념의 규칙은 열 글자 이상이다'],
    operationalPrinciple: '조건이 갖춰지면 그대로 판정된다',
  },
  sources: [{ kind: 'decision', locator: '2026-09-12', supports: '검사용 결정' }],
};

describe('pendingConflicts', () => {
  let root: string;
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'cp-conf-'));
    await scaffoldInit(root, {});
  });
  it('없으면 빈 객체를 반환한다', async () => {
    expect(await readPendingConflictsStrict(root)).toEqual({});
  });
  it('사유를 기록하고 읽는다(불변)', async () => {
    await setPendingConflict(root, 'a', 'conflicts with b');
    expect(await readPendingConflictsStrict(root)).toEqual({ a: 'conflicts with b' });
  });
  it('해소하면 항목이 사라진다', async () => {
    await setPendingConflict(root, 'a', 'x');
    await clearPendingConflict(root, 'a');
    expect(await readPendingConflictsStrict(root)).toEqual({});
  });
  it('setConceptStatus → green 전환 시 충돌 기록이 자동 정리된다', async () => {
    const concept = { ...baseConcept, status: 'pending' } as any;
    await writeConcept(root, concept);
    await setPendingConflict(root, 'test-concept', 'conflicts with existing-concept');
    expect(await readPendingConflictsStrict(root)).toEqual({
      'test-concept': 'conflicts with existing-concept',
    });
    await recordAttest(root, parseConcept(concept), 'pass');
    await setConceptStatus(root, 'test-concept', 'green');
    expect(await readPendingConflictsStrict(root)).toEqual({});
  });
});

// settled-status "충돌로 확정을 미룰 때는 반드시 그 사유를 함께 기록한다" — 다른 개념의 사유를 잃으면 안 된다.
// 쓰기 경로는 "파일 없음"만 빈 기록으로 보고, 깨진 파일이면 던지고 덮어쓰지 않는다.
describe('pendingConflicts — 깨진 기록 파일', () => {
  let root: string;
  let file: string;
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'cp-conf-bad-'));
    await scaffoldInit(root, {});
    file = join(root, 'docs/conceptpowers/concepts/.alignment/pending-conflicts.json');
    mkdirSync(dirname(file), { recursive: true });
  });
  it('JSON이 깨졌으면 setPendingConflict가 던지고 파일을 덮어쓰지 않는다', async () => {
    writeFileSync(file, '{ broken');
    await expect(setPendingConflict(root, 'a', 'x')).rejects.toThrow();
    expect(readFileSync(file, 'utf8')).toBe('{ broken');
  });
  it('값이 문자열이 아니면 clearPendingConflict가 던지고 파일을 덮어쓰지 않는다', async () => {
    const bad = JSON.stringify({ a: 1 });
    writeFileSync(file, bad);
    await expect(clearPendingConflict(root, 'a')).rejects.toThrow();
    expect(readFileSync(file, 'utf8')).toBe(bad);
  });
  it('배열이면 prunePendingConflicts가 던지고 파일을 덮어쓰지 않는다', async () => {
    writeFileSync(file, '[]');
    await expect(prunePendingConflicts(root, new Set())).rejects.toThrow();
    expect(readFileSync(file, 'utf8')).toBe('[]');
  });
});
