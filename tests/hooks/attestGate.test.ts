// @concept:governance-mode @concept:settled-status
// tests/hooks/attestGate.test.ts
// 증빙 문지기(consistency-attest)가 스테이징된 개념 파일을 빠짐없이 판정하는지 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - settled-status 불변 "… 다른 개념과 충돌하지 않는지 검사한 기록이 있을 것(검사 증빙)"
//    → 신선한 pass 증빙이 없는 개념 파일은 잡는다 / 있으면 통과
//  - governance-mode 불변 "강도가 무엇이든 지키는 대상(검사 항목)은 같다"
//    → 파일 이름과 안의 slug가 다른 개념 파일은 조용히 건너뛰지 않고 잡는다(판정 대상에서 사라지면 안 된다)
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAttest } from '../../src/hooks/gates/attestGate.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { writeConcept, readConcept } from '../../src/store/conceptStore.js';
import { recordAttest } from '../../src/concept/attest.js';
import type { GateInput } from '../../src/hooks/gates/types.js';

const DATA = 'docs/conceptpowers/concepts/data';
let root: string;
const input = (files: string[]): GateInput => ({ root, files, cfg: null, report: {} as never });

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'cp-attestgate-'));
  await scaffoldInit(root, {});
  await writeConcept(root, {
    slug: 'auth-token',
    category: ['behavior'],
    title: 'A',
    description: { definition: 'v1' },
    purpose: { reason: 'r' },
    actions: {},
    principle: { immutableRules: ['결제 완료 후 price 변경 불가'] },
  });
});

describe('consistency-attest 문지기', () => {
  it('신선한 pass 증빙이 없으면 잡는다', async () => {
    const f = await checkAttest(input([`${DATA}/auth-token.json`]));
    expect(f?.gate).toBe('consistency-attest');
    expect(f?.reason).toContain('auth-token');
  });
  it('신선한 pass 증빙이 있으면 통과한다', async () => {
    const c = await readConcept(root, 'auth-token');
    await recordAttest(root, c!, 'pass', { compared: ['x'] });
    expect(await checkAttest(input([`${DATA}/auth-token.json`]))).toBeNull();
  });
  it('파일 이름과 안의 slug가 다르면 건너뛰지 않고 잡는다 [규칙: 지키는 대상은 같다]', async () => {
    renameSync(join(root, `${DATA}/auth-token.json`), join(root, `${DATA}/renamed.json`));
    const c = await readConcept(root, 'auth-token');
    await recordAttest(root, c!, 'pass', { compared: ['x'] });
    const f = await checkAttest(input([`${DATA}/renamed.json`]));
    expect(f?.gate).toBe('consistency-attest');
    expect(f?.reason).toContain('renamed');
    expect(f?.reason).toContain('slug');
  });
});
