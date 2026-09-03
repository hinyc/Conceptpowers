// @concept:drift-reconcile @concept:init-gate
// tests/cli/noCode.test.ts
// attest-no-code 명령을 검증한다 — 개념 수정이 코드 변경을 필요로 하지 않는다는 판단의 기록.
// 검증 대상 규칙 ↔ 시나리오:
//  - drift-reconcile 허용 "코드 변경이 필요 없다는 판단을 지문에 묶어 기록하는 것"
//    → 성공 시 기록이 저장되고 exit 0
//  - drift-reconcile 불변 "코드 변경이 필요 없다는 기록은 사유 없이 남길 수 없다"
//    → --note 없이는 exit 1이고 기록이 남지 않는다
//  - "없는 slug는 exit 1"은 존재하지 않는 대상에 대한 방어다(attest-test-review와 같은 태도).
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli.js';
import { writeConcept, readConcept } from '../../src/store/conceptStore.js';
import { readNoCodeLog, freshNoCode } from '../../src/drift/noCode.js';
import { contractHash } from '../../src/drift/hash.js';
import { scaffoldInit } from '../../src/init/scaffold.js';

const conceptInput = {
  slug: 'cli-target',
  category: ['behavior'],
  title: 'T',
  description: { definition: '정의' },
  purpose: { reason: '이유' },
  actions: {},
  principle: { immutableRules: ['결제 완료 후 price 변경 불가'] },
};

describe('cli: attest-no-code', () => {
  let root: string;
  let output: string;
  const out = (s: string) => {
    output += s;
  };
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-cli-nc-'));
    await scaffoldInit(root, {});
    await writeConcept(root, conceptInput);
    output = '';
  });

  it('사유와 함께 기록이 저장된다 [규칙: 판단을 지문에 묶어 기록]', async () => {
    const code = await runCli(
      ['attest-no-code', 'cli-target', '--note', '문구 정리만 — 코드 영향 없음', '--root', root],
      out
    );
    expect(code).toBe(0);
    const log = await readNoCodeLog(root);
    expect(log['cli-target'].note).toBe('문구 정리만 — 코드 영향 없음');
    const c = await readConcept(root, 'cli-target');
    expect(freshNoCode(log, 'cli-target', contractHash(c!))).toBe(true);
  });

  it('--note 없이는 실패하고 기록이 남지 않는다 [규칙: 사유 없이 남길 수 없다]', async () => {
    const code = await runCli(['attest-no-code', 'cli-target', '--root', root], out);
    expect(code).toBe(1);
    expect(await readNoCodeLog(root)).toEqual({});
  });

  it('없는 slug는 exit 1', async () => {
    const code = await runCli(['attest-no-code', 'ghost', '--note', '사유', '--root', root], out);
    expect(code).toBe(1);
    expect(output).toContain('ghost');
  });
});
