// @concept:init-gate @concept:settled-status
// tests/concept/approve.test.ts
// 빨강 → 초록 승인(approveConcept)을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - settled-status 불변 "빨강을 초록으로 올리는 것은 사람이 명시적으로 요청했을 때만 한다"
//    → red 개념을 green으로 승인한다
//  - settled-status 불변 "한 번 확정된 초록·빨강은 시스템 경로로는 되돌리지 않는다"
//    → 이미 green인 개념은 승인을 거부한다
//  - settled-status 허용 "검사 증빙을 갖춘 노랑을 초록으로 올리는 것"
//    → pending 개념은 승인을 거부한다 (노랑은 증빙 경로로 올라가고, approve는 빨강 전용이다)
//  - "없는 개념은 에러를 던진다"는 대응하는 개념 규칙이 없다 — 존재하지 않는 대상에 대한 방어다.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { writeConcept } from '../../src/store/conceptStore.js';
import { approveConcept } from '../../src/concept/approve.js';
import { recordAttest } from '../../src/concept/attest.js';
import { parseConcept } from '../../src/schema/concept.js';

const baseConcept = {
  slug: 'admin-role',
  group: 'auth',
  category: ['role'],
  title: 'Admin',
  description: { definition: 'd' },
  purpose: { reason: 'r' },
  actions: {},
  state: { managed: ['이 개념이 관리하는 대상'] },
  principle: { immutableRules: ['이 개념의 규칙은 열 글자 이상이다'], operationalPrinciple: '조건이 갖춰지면 그대로 판정된다' },
  status: 'red',
};

describe('approveConcept', () => {
  let root: string;
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'cp-approve-'));
    await scaffoldInit(root, {});
    await writeConcept(root, baseConcept);
  });
  it('red 개념을 green으로 승인한다', async () => {
    await recordAttest(root, parseConcept(baseConcept), 'pass');
    const c = await approveConcept(root, 'admin-role');
    expect(c.status).toBe('green');
  });
  it('이미 green인 개념은 승인을 거부한다', async () => {
    await writeConcept(root, { ...baseConcept, status: 'green' });
    await expect(approveConcept(root, 'admin-role')).rejects.toThrow(/green/i);
  });
  it('pending 개념은 승인을 거부한다(approve는 red 전용)', async () => {
    await writeConcept(root, { ...baseConcept, status: 'pending' });
    await expect(approveConcept(root, 'admin-role')).rejects.toThrow(/pending|consistency/i);
  });
  it('없는 개념은 에러를 던진다', async () => {
    await expect(approveConcept(root, 'ghost')).rejects.toThrow(/not found/i);
  });
});
