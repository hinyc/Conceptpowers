// @concept:settled-status @concept:atomic-baseline-write
// 초록 승격 가드(setConceptStatus)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - settled-status 불변 "초록이 되려면 두 가지가 갖춰져야 한다 — 지킬 수 있는 규칙이 실제로 적혀
//    있을 것(품질 최소치), 다른 개념과 충돌하지 않는지 검사한 기록이 있을 것(검사 증빙)"
//    → 품질 결격이면 거부 / 증빙 없으면 거부 / 증빙이 stale이면 거부 / 둘 다 갖추면 승격 성공
//  - settled-status 구성요소 "노랑(pending) / 빨강(red)" → green이 아닌 전이는 이 가드와 무관하게 동작
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeConcept, setConceptStatus } from '../../src/store/conceptStore.js';
import { recordAttest } from '../../src/concept/attest.js';
import { parseConcept } from '../../src/schema/concept.js';

const GOOD_RULE = '결제 완료 후 price 필드는 어떤 경로로도 변경 불가';

function conceptInput(over: Record<string, unknown> = {}) {
  return {
    slug: 'gate-target',
    category: ['behavior'],
    status: 'pending',
    title: 'T',
    description: { definition: '정의' },
    purpose: { reason: '이유' },
    actions: {},
    state: { managed: ['이 개념이 관리하는 대상'] },
    principle: { immutableRules: [GOOD_RULE], operationalPrinciple: '조건이 갖춰지면 그대로 판정된다' },
    ...over,
  };
}

describe('green 승격 가드', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-gate-'));
  });

  it('품질 결격(규칙 0개)이면 승격 거부', async () => {
    await writeConcept(root, conceptInput({ principle: {} }));
    await expect(setConceptStatus(root, 'gate-target', 'green')).rejects.toThrow(
      /quality deficienc/i
    );
  });

  it('품질 통과 + 증빙 없음이면 승격 거부', async () => {
    await writeConcept(root, conceptInput());
    await expect(setConceptStatus(root, 'gate-target', 'green')).rejects.toThrow(/attest/i);
  });

  it('품질 통과 + 신선한 pass 증빙이면 승격 성공', async () => {
    const c = parseConcept(conceptInput());
    await writeConcept(root, c);
    await recordAttest(root, c, 'pass');
    const updated = await setConceptStatus(root, 'gate-target', 'green');
    expect(updated.status).toBe('green');
  });

  it('증빙이 stale(계약 변경 후)이면 승격 거부', async () => {
    const before = parseConcept(
      conceptInput({ principle: { immutableRules: ['이전 규칙입니다 충분히 김'], operationalPrinciple: '조건이 갖춰지면 그대로 판정된다' } })
    );
    await recordAttest(root, before, 'pass');
    await writeConcept(root, conceptInput()); // 계약이 다른 내용으로 저장됨
    await expect(setConceptStatus(root, 'gate-target', 'green')).rejects.toThrow(/attest/i);
  });

  it('green이 아닌 전이(pending→red)는 가드와 무관하게 동작', async () => {
    await writeConcept(root, conceptInput({ principle: {} }));
    const updated = await setConceptStatus(root, 'gate-target', 'red');
    expect(updated.status).toBe('red');
  });
});
