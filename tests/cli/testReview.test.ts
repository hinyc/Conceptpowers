// @concept:concept-driven-tests @concept:init-gate
// tests/cli/testReview.test.ts
// attest-test-review 명령을 검증한다 — 개념 변경에 딸린 검사를 어떻게 처리했는지 남기는 기록.
// 검증 대상 규칙 ↔ 시나리오:
//  - concept-driven-tests 허용 "검사를 고칠 필요가 없다고 판단한 경우, 그 사유를 검토 기록으로
//    남겨 통과시키는 것" → updated/no-impact/no-tests 기록이 저장된다
//  - concept-driven-tests 불변 "검사를 함께 고쳤거나, 고칠 필요가 없다는 사유를 기록으로 남겼거나"
//    → 고치지 않기로 한 판단(no-impact·no-tests)은 --note 없이 기록할 수 없다
//    → 고쳤다(updated)는 기록은 어떤 검사를 고쳤는지 --tests 없이 남길 수 없다
//  - 상위 기준 문서 "갈아 끼우기 방식"의 불변 "실패를 감추지 않는다" → 상한을 넘는 --note는 exit 1이고 기존
//    기록이 훼손되지 않는다
//  - "없는 slug·잘못된 --result는 exit 1"은 존재하지 않는 대상에 대한 방어다.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli.js';
import { writeConcept } from '../../src/store/conceptStore.js';
import { readTestReviewLog } from '../../src/concept/testReview.js';
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

describe('cli: attest-test-review', () => {
  let root: string;
  let output: string;
  const out = (s: string) => {
    output += s;
  };
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-cli-tr-'));
    await scaffoldInit(root, {});
    await writeConcept(root, conceptInput);
    output = '';
  });

  it('검사를 고쳤다는 기록이 저장된다 [규칙: 검사를 함께 고쳤거나]', async () => {
    const code = await runCli(
      [
        'attest-test-review',
        'cli-target',
        '--result',
        'updated',
        '--tests',
        'tests/pay.test.ts, tests/refund.test.ts',
        '--root',
        root,
      ],
      out
    );
    expect(code).toBe(0);
    const log = await readTestReviewLog(root);
    expect(log['cli-target'].result).toBe('updated');
    expect(log['cli-target'].tests).toEqual(['tests/pay.test.ts', 'tests/refund.test.ts']);
  });

  it('고칠 필요 없음(no-impact)은 사유와 함께 저장된다 [규칙: 사유를 기록으로 남겼거나]', async () => {
    const code = await runCli(
      [
        'attest-test-review',
        'cli-target',
        '--result',
        'no-impact',
        '--note',
        '문구만 다듬음',
        '--root',
        root,
      ],
      out
    );
    expect(code).toBe(0);
    expect((await readTestReviewLog(root))['cli-target'].note).toBe('문구만 다듬음');
  });

  it('딸린 검사 없음(no-tests)도 사유와 함께 저장된다 [규칙: 검사가 없어도 조용히 넘어가지 않는다]', async () => {
    const code = await runCli(
      [
        'attest-test-review',
        'cli-target',
        '--result',
        'no-tests',
        '--note',
        '아직 검사 없음',
        '--root',
        root,
      ],
      out
    );
    expect(code).toBe(0);
    expect((await readTestReviewLog(root))['cli-target'].result).toBe('no-tests');
  });

  it('고치지 않기로 한 판단은 사유 없이 기록할 수 없다 [규칙: 사유를 남겨야 넘어간다]', async () => {
    const code = await runCli(
      ['attest-test-review', 'cli-target', '--result', 'no-impact', '--root', root],
      out
    );
    expect(code).toBe(1);
    expect(JSON.parse(output).error).toMatch(/--note is required/);
    expect(await readTestReviewLog(root)).toEqual({});
  });

  it('고쳤다는 기록은 어떤 검사를 고쳤는지 없이 남길 수 없다', async () => {
    const code = await runCli(
      ['attest-test-review', 'cli-target', '--result', 'updated', '--root', root],
      out
    );
    expect(code).toBe(1);
    expect(JSON.parse(output).error).toMatch(/--tests/);
  });

  it('정해진 값 밖의 --result는 exit 1', async () => {
    const code = await runCli(
      ['attest-test-review', 'cli-target', '--result', 'skipped', '--root', root],
      out
    );
    expect(code).toBe(1);
    expect(JSON.parse(output).error).toMatch(/--result must be/);
  });

  it('없는 slug는 exit 1 + error', async () => {
    const code = await runCli(
      ['attest-test-review', 'no-such', '--result', 'no-tests', '--note', 'x', '--root', root],
      out
    );
    expect(code).toBe(1);
    expect(JSON.parse(output).error).toMatch(/not found/i);
  });

  it('상한을 넘는 --note는 exit 1이고 기존 기록이 훼손되지 않는다 [규칙: 실패를 감추지 않는다]', async () => {
    await runCli(
      [
        'attest-test-review',
        'cli-target',
        '--result',
        'no-tests',
        '--note',
        '첫 기록',
        '--root',
        root,
      ],
      out
    );
    output = '';
    const code = await runCli(
      [
        'attest-test-review',
        'cli-target',
        '--result',
        'no-tests',
        '--note',
        'x'.repeat(1001),
        '--root',
        root,
      ],
      out
    );
    expect(code).toBe(1);
    expect((await readTestReviewLog(root))['cli-target'].note).toBe('첫 기록');
  });
});
