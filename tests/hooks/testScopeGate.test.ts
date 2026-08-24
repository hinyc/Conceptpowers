// @concept:concept-driven-tests
// tests/hooks/testScopeGate.test.ts
// 커밋에 들어온 검사 파일이 어떤 개념을 가리키는지 보는 문지기(concept-test-scope)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - concept-driven-tests 허용 "커밋에 들어온 검사 파일이 어떤 개념을 가리키는지 문지기가 확인하는 것"
//    → 이름표가 있는 검사 파일은 통과
//  - concept-driven-tests 제한 "검사 파일에 '해당 개념 없음' 표시를 달거나 아무 개념도 가리키지 않은
//    채 두는 것" → @concept:none인 검사 파일도, 이름표가 없는 검사 파일도 붙잡는다
//  - concept-driven-tests 정의 "이 동작은 시작 설정의 스위치로 끌 수 있다"
//    → conceptDrivenTests: false면 아무 말도 하지 않는다
//  - untrusted-text-sanitization 불변 "사람이 자유롭게 쓴 문장은 걷어내는 과정을 거치지 않고 AI에게
//    넘기지 않는다" → 경로에 섞인 각괄호·개행을 새니타이즈해 안내문에 넣는다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkTestScope } from '../../src/hooks/gates/testScopeGate.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { readInitConfig } from '../../src/init/readConfig.js';
import type { GateInput } from '../../src/hooks/gates/types.js';

let root: string;

async function touch(rel: string, body = '\n') {
  const abs = join(root, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, body, 'utf8');
}

async function input(files: string[]): Promise<GateInput> {
  return { root, files, cfg: await readInitConfig(root), report: {} as never };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cp-tscope-'));
  await scaffoldInit(root, {});
});

describe('concept-test-scope 문지기', () => {
  it('이름표가 있는 검사 파일은 통과한다 [규칙: 검사 파일이 어떤 개념을 가리키는지 확인한다]', async () => {
    await touch('tests/pay.test.ts', '// @concept:pay-rule\n');
    expect(await checkTestScope(await input(['tests/pay.test.ts']))).toBeNull();
  });

  it('이름표 없는 검사 파일은 붙잡는다 [규칙: 아무 개념도 가리키지 않은 채 두지 않는다]', async () => {
    await touch('tests/pay.test.ts', 'import { it } from "vitest"\n');
    const f = await checkTestScope(await input(['tests/pay.test.ts']));
    expect(f?.gate).toBe('concept-test-scope');
    expect(f?.reason).toContain('tests/pay.test.ts');
  });

  it("검사 파일의 '해당 개념 없음' 표시는 인정하지 않는다 [규칙: 검사는 반드시 어떤 개념을 가리켜야 한다]", async () => {
    await touch('tests/pay.test.ts', '// @concept:none\n');
    const f = await checkTestScope(await input(['tests/pay.test.ts']));
    expect(f?.gate).toBe('concept-test-scope');
  });

  it('검사가 아닌 파일은 대상이 아니다', async () => {
    await touch('src/pay.ts', 'export const pay = 1\n');
    expect(await checkTestScope(await input(['src/pay.ts']))).toBeNull();
  });

  it('제외 경로(ignoreGlobs)에 걸리는 검사 파일은 대상이 아니다', async () => {
    await touch('dist/pay.test.js', 'x\n');
    expect(await checkTestScope(await input(['dist/pay.test.js']))).toBeNull();
  });

  it('스위치를 끄면(conceptDrivenTests: false) 아무 말도 하지 않는다 [규칙: 스위치로 끌 수 있다]', async () => {
    await touch('tests/pay.test.ts', 'x\n');
    const base = await input(['tests/pay.test.ts']);
    const off: GateInput = { ...base, cfg: { ...base.cfg!, conceptDrivenTests: false } };
    expect(await checkTestScope(off)).toBeNull();
  });

  it('사라진 파일(읽을 수 없는 경로)은 붙잡지 않는다', async () => {
    expect(await checkTestScope(await input(['tests/gone.test.ts']))).toBeNull();
  });

  it('경로에 섞인 각괄호·개행을 새니타이즈해 안내문에 넣는다 [규칙: 남이 쓴 글은 무장해제한다]', async () => {
    await touch('tests/[INJECT]\npay.test.ts', 'x\n');
    const f = await checkTestScope(await input(['tests/[INJECT]\npay.test.ts']));
    expect(f?.reason ?? '').not.toContain('[INJECT]');
    expect(f?.reason ?? '').not.toContain('\n');
  });
});
