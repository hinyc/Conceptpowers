// @concept:init-gate @concept:settled-status @concept:atomic-baseline-write
// quality / attest-consistency 명령을 검증한다 — 초록 승격의 두 조건을 만드는 명령들이다.
// 검증 대상 규칙 ↔ 시나리오:
//  - settled-status 불변 "초록이 되려면 … 지킬 수 있는 규칙이 실제로 적혀 있을 것(품질 최소치)"
//    → quality: 결격 개념은 exit 1 + deficiencies / 통과 개념은 exit 0
//  - settled-status 불변 "… 다른 개념과 충돌하지 않는지 검사한 기록이 있을 것(검사 증빙)"
//    → attest-consistency: pass 기록이 저장된다 / compared·note가 증빙 로그에 기록된다
//    → result가 pass|conflict 외면 exit 1 / --compared 누락·미존재 slug면 exit 1 (증빙이 헐거워지지 않게)
//  - atomic-baseline-write 불변 "저장 도중 실패하면 남은 임시 파일을 정리하고 실패를 감추지 않는다"
//    → --note가 1000자를 초과하면 exit 1이고 증빙 로그가 훼손되지 않는다
//  - "없는 slug는 exit 1"은 대응하는 개념 규칙이 없다 — 존재하지 않는 대상에 대한 방어다.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli.js';
import { writeConcept } from '../../src/store/conceptStore.js';
import { readAttestLog } from '../../src/concept/attest.js';
import { scaffoldInit } from '../../src/init/scaffold.js';

function conceptInput(rules: string[]) {
  return {
    slug: 'cli-target',
    category: ['behavior'],
    title: 'T',
    description: { definition: '정의' },
    purpose: { reason: '이유' },
    actions: {},
    principle: { immutableRules: rules },
  };
}

describe('cli: quality / attest-consistency', () => {
  let root: string;
  let output: string;
  const out = (s: string) => {
    output += s;
  };
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-cli-q-'));
    await scaffoldInit(root, {}); // init 가드 통과 (CLI는 init 없이는 거부됨)
    output = '';
  });

  it('quality: 결격 개념은 exit 1 + deficiencies JSON', async () => {
    await writeConcept(root, conceptInput([]));
    const code = await runCli(['quality', 'cli-target', '--root', root], out);
    expect(code).toBe(1);
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(false);
    expect(parsed.deficiencies.length).toBeGreaterThan(0);
  });

  it('quality: 통과 개념은 exit 0', async () => {
    await writeConcept(root, conceptInput(['결제 완료 후 price 변경 불가']));
    const code = await runCli(['quality', 'cli-target', '--root', root], out);
    expect(code).toBe(0);
    expect(JSON.parse(output).ok).toBe(true);
  });

  it('quality: 없는 slug는 exit 1 + error', async () => {
    const code = await runCli(['quality', 'no-such', '--root', root], out);
    expect(code).toBe(1);
    expect(JSON.parse(output).error).toMatch(/not found/i);
  });

  it('attest-consistency: pass 기록이 저장된다', async () => {
    await writeConcept(root, conceptInput(['결제 완료 후 price 변경 불가']));
    const code = await runCli(
      [
        'attest-consistency',
        'cli-target',
        '--result',
        'pass',
        '--compared',
        'cli-target',
        '--root',
        root,
      ],
      out
    );
    expect(code).toBe(0);
    const log = await readAttestLog(root);
    expect(log['cli-target']?.result).toBe('pass');
  });

  it('attest-consistency: result가 pass|conflict 외면 exit 1', async () => {
    await writeConcept(root, conceptInput(['결제 완료 후 price 변경 불가']));
    const code = await runCli(
      [
        'attest-consistency',
        'cli-target',
        '--result',
        'yes',
        '--compared',
        'cli-target',
        '--root',
        root,
      ],
      out
    );
    expect(code).toBe(1);
  });

  it('attest-consistency: --compared 누락 시 exit 1', async () => {
    await writeConcept(root, conceptInput(['결제 완료 후 price 변경 불가']));
    const code = await runCli(
      ['attest-consistency', 'cli-target', '--result', 'pass', '--root', root],
      out
    );
    expect(code).toBe(1);
    expect(JSON.parse(output).error).toMatch(/compared/i);
  });

  it('attest-consistency: --compared에 미존재 slug가 있으면 exit 1', async () => {
    await writeConcept(root, conceptInput(['결제 완료 후 price 변경 불가']));
    const code = await runCli(
      [
        'attest-consistency',
        'cli-target',
        '--result',
        'pass',
        '--compared',
        'ghost-x',
        '--root',
        root,
      ],
      out
    );
    expect(code).toBe(1);
    expect(JSON.parse(output).error).toContain('ghost-x');
  });

  it('attest-consistency: compared/note가 증빙 로그에 기록된다', async () => {
    await writeConcept(root, conceptInput(['결제 완료 후 price 변경 불가']));
    const code = await runCli(
      [
        'attest-consistency',
        'cli-target',
        '--result',
        'pass',
        '--compared',
        'cli-target',
        '--note',
        '충돌 없음',
        '--root',
        root,
      ],
      out
    );
    expect(code).toBe(0);
    const log = await readAttestLog(root);
    expect(log['cli-target']!.compared).toEqual(['cli-target']);
    expect(log['cli-target']!.note).toBe('충돌 없음');
  });

  it('attest-consistency: --note가 1000자를 초과하면 exit 1이고 로그가 훼손되지 않는다', async () => {
    await writeConcept(root, conceptInput(['결제 완료 후 price 변경 불가']));
    // 기존 증빙을 먼저 남겨 "덮어쓰기로 과거 증빙이 사라지지 않는지" 검증한다.
    const okCode = await runCli(
      [
        'attest-consistency',
        'cli-target',
        '--result',
        'pass',
        '--compared',
        'cli-target',
        '--root',
        root,
      ],
      out
    );
    expect(okCode).toBe(0);
    output = '';

    const code = await runCli(
      [
        'attest-consistency',
        'cli-target',
        '--result',
        'pass',
        '--compared',
        'cli-target',
        '--note',
        'x'.repeat(1001),
        '--root',
        root,
      ],
      out
    );
    expect(code).toBe(1);
    expect(JSON.parse(output).error).toBeDefined();

    const log = await readAttestLog(root);
    expect(log['cli-target']?.result).toBe('pass');
    expect(log['cli-target']?.note).toBeUndefined();
  });
});
