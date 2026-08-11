// @concept:settled-status
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAttestLog, recordAttest, freshPassAttest } from '../../src/concept/attest.js';
import { parseConcept } from '../../src/schema/concept.js';

function makeConcept(rules: string[]) {
  return parseConcept({
    slug: 'attest-target',
    category: ['behavior'],
    title: 'T',
    description: { definition: '정의' },
    purpose: { reason: '이유' },
    actions: {},
    principle: { immutableRules: rules },
  });
}

describe('attest', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-attest-'));
  });

  it('기록 없는 root에서 readAttestLog는 빈 객체', async () => {
    expect(await readAttestLog(root)).toEqual({});
  });

  it('recordAttest 후 freshPassAttest가 true', async () => {
    const c = makeConcept(['결제 완료 후 price 변경 불가']);
    const entry = await recordAttest(root, c, 'pass');
    expect(entry.result).toBe('pass');
    const log = await readAttestLog(root);
    expect(freshPassAttest(log, c)).toBe(true);
  });

  it('개념 계약이 바뀌면 증빙이 실효(해시 불일치)', async () => {
    const c = makeConcept(['결제 완료 후 price 변경 불가']);
    await recordAttest(root, c, 'pass');
    const changed = makeConcept(['환불은 7일 이내에만 허용된다']);
    const log = await readAttestLog(root);
    expect(freshPassAttest(log, changed)).toBe(false);
  });

  it('result=conflict 증빙은 fresh여도 pass로 인정 안 함', async () => {
    const c = makeConcept(['결제 완료 후 price 변경 불가']);
    await recordAttest(root, c, 'conflict');
    const log = await readAttestLog(root);
    expect(freshPassAttest(log, c)).toBe(false);
  });

  it('recordAttest는 다른 slug의 기존 기록을 보존한다', async () => {
    const a = makeConcept(['결제 완료 후 price 변경 불가']);
    const b = parseConcept({
      slug: 'other-concept',
      category: ['behavior'],
      title: 'B',
      description: { definition: '정의' },
      purpose: { reason: '이유' },
      actions: {},
      principle: { immutableRules: ['관리자는 하드삭제되지 않는다'] },
    });
    await recordAttest(root, a, 'pass');
    await recordAttest(root, b, 'pass');
    const log = await readAttestLog(root);
    expect(Object.keys(log).sort()).toEqual(['attest-target', 'other-concept']);
  });

  it('recordAttest는 evidence(compared/note)를 함께 기록한다', async () => {
    const c = makeConcept(['결제 완료 후 price 변경 불가']);
    const entry = await recordAttest(root, c, 'pass', {
      compared: ['other-concept'],
      note: '충돌 없음',
    });
    expect(entry.compared).toEqual(['other-concept']);
    expect(entry.note).toBe('충돌 없음');
    const log = await readAttestLog(root);
    expect(log['attest-target']!.compared).toEqual(['other-concept']);
    expect(log['attest-target']!.note).toBe('충돌 없음');
  });

  it('evidence 없는 recordAttest는 기존과 동일하게 동작한다', async () => {
    const c = makeConcept(['결제 완료 후 price 변경 불가']);
    const entry = await recordAttest(root, c, 'pass');
    expect(entry.compared).toBeUndefined();
    const log = await readAttestLog(root);
    expect(freshPassAttest(log, c)).toBe(true);
  });
});
