// @concept:concept-driven-tests @concept:drift-reconcile
// tests/hooks/recordCommands.test.ts
// 사람의 판단을 남기는 기록 명령(검토 기록·코드무관 기록)을 실행하기 전에 문지기가 사람에게 묻는지 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - concept-driven-tests 제한 "사람의 확인 없이 검토 기록을 남겨 통과시키는 것"
//    → attest-test-review를 실행하는 명령은 어느 강도에서도 ask다(따옴표·명령 치환 속이어도)
//  - drift-reconcile 불변 "코드 변경이 필요 없다는 기록은 사람의 확인을 거쳐 남긴다 — 문지기는 그 기록을 남기는
//    명령을 실행하기 전에 사람에게 묻는다"
//    → attest-no-code를 실행하는 명령은 어느 강도에서도 ask다
//    → 명령 이름이 인자로만 든 글자(grep·echo·vitest -t)면 묻지 않는다 / 검사 증빙(attest-consistency)은 묻지 않는다
//  - governance-mode 불변 "문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다 — … 확정할 수 없으면 검사를
//    마친 것처럼 통과시키지 않고 강도에 맞춰 대응한다"
//    → 기록 명령과 커밋을 한 명령에 섞어도 커밋 판정이 사라지지 않는다(strict는 여전히 deny)
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decidePreToolUse } from '../../src/hooks/preToolUse.js';
import { findHumanRecordCommands } from '../../src/hooks/command/recordCommands.js';
import { scaffoldInit } from '../../src/init/scaffold.js';

describe('findHumanRecordCommands', () => {
  const cases: [string, string[]][] = [
    ['node "/p/dist/cli.js" attest-no-code foo --note "문구만" --root .', ['attest-no-code']],
    ['node cli.js attest-test-review foo --result no-impact --note x', ['attest-test-review']],
    ['cd . && node cli.js attest-no-code foo --note x', ['attest-no-code']],
    [
      'echo $(node cli.js attest-test-review foo --result no-tests --note x)',
      ['attest-test-review'],
    ],
    ['sh -c "node cli.js attest-no-code foo --note x"', ['attest-no-code']],
    ['grep -rn "attest-no-code" src', []],
    ["echo 'node cli.js attest-no-code foo'", []],
    ['node cli.js attest-consistency foo --result pass --compared all', []],
    ['git commit -m "attest-no-code 안내 추가"', []],
    ['pnpm exec vitest run -t attest-no-code', []],
    ['./dist/cli.js attest-no-code foo --note x', ['attest-no-code']],
    ['bash -lc "node cli.js attest-no-code foo --note x"', ['attest-no-code']],
    [
      'eval "node cli.js attest-test-review foo --result no-tests --note x"',
      ['attest-test-review'],
    ],
  ];
  for (const [cmd, expected] of cases) {
    it(`${JSON.stringify(cmd).slice(0, 60)} → ${expected.join(',') || '없음'}`, () => {
      expect(findHumanRecordCommands(cmd)).toEqual(expected);
    });
  }
});

describe('기록 명령 실행 전 확인 [규칙: 사람의 확인 없이 기록을 남기지 않는다]', () => {
  let root: string;
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'cp-record-'));
    await scaffoldInit(root, {});
  });
  const setEnforcement = (level: string) => {
    const p = join(root, 'docs/conceptpowers/init.json');
    writeFileSync(
      p,
      JSON.stringify({ ...JSON.parse(readFileSync(p, 'utf8')), enforcement: level })
    );
  };
  const run = (command: string) => decidePreToolUse(root, { tool: 'Bash', input: { command } });

  for (const level of ['strict', 'standard', 'light']) {
    it(`${level}: attest-no-code·attest-test-review는 ask다`, async () => {
      setEnforcement(level);
      for (const cmd of [
        'node cli.js attest-no-code foo --note "x" --root .',
        'node cli.js attest-test-review foo --result no-impact --note "x" --root .',
      ]) {
        const r = await run(cmd);
        expect(r!.hookSpecificOutput.permissionDecision, cmd).toBe('ask');
        expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('사람의 확인');
      }
    });
  }
  it('인자로만 든 글자나 검사 증빙 명령은 묻지 않는다', async () => {
    expect(await run('grep -rn "attest-no-code" src')).toBeNull();
    expect(await run('node cli.js attest-consistency foo --result pass --compared all')).toBeNull();
  });
  it('기록 명령과 커밋을 섞으면 strict는 여전히 막고, standard·light는 둘 다 담아 묻는다', async () => {
    const mixed = 'node cli.js attest-no-code foo --note x; git commit -m y';
    setEnforcement('strict');
    const strict = await run(mixed);
    expect(strict!.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(strict!.hookSpecificOutput.permissionDecisionReason).toContain('HUMAN RECORD');
    for (const level of ['standard', 'light']) {
      setEnforcement(level);
      const r = await run(mixed);
      expect(r!.hookSpecificOutput.permissionDecision, level).toBe('ask');
      expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('HUMAN RECORD');
      expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('COMMIT');
    }
  });
});
