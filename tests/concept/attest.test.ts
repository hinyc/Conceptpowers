// @concept:settled-status
// 충돌 검사 증빙(attest) 기록과 신선도 판정을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - settled-status 불변 "초록이 되려면 … 다른 개념과 충돌하지 않는지 검사한 기록이 있을 것(검사 증빙)"
//    → recordAttest 후 freshPassAttest가 true / result=conflict 증빙은 pass로 인정 안 함
//    → 개념 계약이 바뀌면 증빙이 실효(해시 불일치) — 증빙은 검사한 그 계약에만 붙는다
//  - 저장 세부(기록 없는 root면 빈 객체, 다른 slug 기록 보존, evidence 필드, note 1000자 상한)는
//    개념 규칙이 아니라 증빙 로그가 훼손되지 않게 하는 구현 세부다.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readAttestLog,
  recordAttest,
  freshPassAttest,
  pruneAttestLog,
} from '../../src/concept/attest.js';
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

  it('note가 1000자를 초과하면 recordAttest가 던지고 로그를 훼손하지 않는다', async () => {
    const a = makeConcept(['결제 완료 후 price 변경 불가']);
    await recordAttest(root, a, 'pass', { note: '기존 증빙' });

    const b = parseConcept({
      slug: 'other-concept',
      category: ['behavior'],
      title: 'B',
      description: { definition: '정의' },
      purpose: { reason: '이유' },
      actions: {},
      principle: { immutableRules: ['관리자는 하드삭제되지 않는다'] },
    });
    await expect(recordAttest(root, b, 'pass', { note: 'x'.repeat(1001) })).rejects.toThrow();

    // 실패한 기록 시도가 기존 로그를 훼손하지 않아야 한다 (덮어쓰기 금지).
    const log = await readAttestLog(root);
    expect(Object.keys(log)).toEqual(['attest-target']);
    expect(log['attest-target']!.note).toBe('기존 증빙');
    expect(log['other-concept']).toBeUndefined();
  });

  it('note가 정확히 1000자면 recordAttest가 성공한다', async () => {
    const c = makeConcept(['결제 완료 후 price 변경 불가']);
    const note = 'x'.repeat(1000);
    const entry = await recordAttest(root, c, 'pass', { note });
    expect(entry.note).toBe(note);
    const log = await readAttestLog(root);
    expect(log['attest-target']!.note).toBe(note);
  });
});

// 증빙 기록 보존: settled-status "검사 증빙" + governance-mode "기록이 저장소에 남지 않으면 증빙이 아니다".
// 쓰기 경로는 "파일 없음"만 빈 기록으로 보고, 깨진 파일이면 던지고 손대지 않는다.
// 읽기 판정(readAttestLog)은 안전한 쪽 실패(빈 기록 = 증빙 없음 → 승격 막힘)를 유지한다.
describe('attest — 깨진 기록 파일', () => {
  let root: string;
  const file = (r: string) => join(r, 'docs/conceptpowers/concepts/.alignment/attest.json');
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-attest-bad-'));
    await mkdir(join(root, 'docs/conceptpowers/concepts/.alignment'), { recursive: true });
  });

  it('JSON이 깨졌으면 recordAttest가 던지고 파일을 덮어쓰지 않는다', async () => {
    await writeFile(file(root), '{ broken', 'utf8');
    await expect(
      recordAttest(root, makeConcept(['결제 완료 후 price 변경 불가']), 'pass')
    ).rejects.toThrow();
    expect(await readFile(file(root), 'utf8')).toBe('{ broken');
  });

  it('스키마 검증에 실패하면 pruneAttestLog가 던지고 파일을 덮어쓰지 않는다', async () => {
    const bad = JSON.stringify({ x: { hash: 1 } });
    await writeFile(file(root), bad, 'utf8');
    await expect(pruneAttestLog(root, new Set())).rejects.toThrow();
    expect(await readFile(file(root), 'utf8')).toBe(bad);
  });

  it('읽기 판정은 깨진 파일을 증빙 없음(빈 기록)으로 본다', async () => {
    await writeFile(file(root), '{ broken', 'utf8');
    expect(await readAttestLog(root)).toEqual({});
  });
});
