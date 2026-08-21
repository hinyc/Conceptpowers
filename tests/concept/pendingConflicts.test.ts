// @concept:init-gate @concept:pending-conflict-tracking @concept:settled-status @concept:atomic-baseline-write
// 충돌 사유 기록(pendingConflicts)을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - pending-conflict-tracking 불변 "충돌로 확정을 미룰 때는 반드시 그 사유를 함께 기록한다"
//    → 사유를 기록하고 읽는다
//  - pending-conflict-tracking 불변 "확정되는 순간 남아 있던 충돌 사유 기록을 지운다"
//    → 해소하면 항목이 사라진다 / setConceptStatus → green 전환 시 자동 정리된다
//  - atomic-baseline-write 구성요소 "대상: … 충돌 기록 …" → 기록이 없으면 빈 객체(깨진 값 대신 안전한 기본값)
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldInit } from '../../src/init/scaffold.js';
import {
  readPendingConflicts,
  setPendingConflict,
  clearPendingConflict,
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
  principle: { immutableRules: ['이 개념의 규칙은 열 글자 이상이다'] },
};

describe('pendingConflicts', () => {
  let root: string;
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'cp-conf-'));
    await scaffoldInit(root, {});
  });
  it('없으면 빈 객체를 반환한다', async () => {
    expect(await readPendingConflicts(root)).toEqual({});
  });
  it('사유를 기록하고 읽는다(불변)', async () => {
    await setPendingConflict(root, 'a', 'conflicts with b');
    expect(await readPendingConflicts(root)).toEqual({ a: 'conflicts with b' });
  });
  it('해소하면 항목이 사라진다', async () => {
    await setPendingConflict(root, 'a', 'x');
    await clearPendingConflict(root, 'a');
    expect(await readPendingConflicts(root)).toEqual({});
  });
  it('setConceptStatus → green 전환 시 충돌 기록이 자동 정리된다', async () => {
    const concept = { ...baseConcept, status: 'pending' } as any;
    await writeConcept(root, concept);
    await setPendingConflict(root, 'test-concept', 'conflicts with existing-concept');
    expect(await readPendingConflicts(root)).toEqual({
      'test-concept': 'conflicts with existing-concept',
    });
    await recordAttest(root, parseConcept(concept), 'pass');
    await setConceptStatus(root, 'test-concept', 'green');
    expect(await readPendingConflicts(root)).toEqual({});
  });
});
