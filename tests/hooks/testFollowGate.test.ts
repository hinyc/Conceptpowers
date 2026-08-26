// @concept:concept-driven-tests
// tests/hooks/testFollowGate.test.ts
// 바뀐 개념에 딸린 검사가 함께 따라왔는지 보는 문지기(concept-test-follow)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - concept-driven-tests 허용 "바뀐 개념에 딸린 검사가 함께 오지 않은 커밋을 문지기가 붙잡는 것"
//    → 개념만 바뀌고 검사가 안 오면 finding / 검사가 함께 오면 통과
//  - concept-driven-tests 허용 "검사를 고칠 필요가 없다고 판단한 경우, 그 사유를 검토 기록으로
//    남겨 통과시키는 것" → 신선한 검토 기록이 있으면 통과
//  - concept-driven-tests 불변 "딸린 검사가 아예 없더라도 조용히 넘어가지 않는다"
//    → 연결된 검사가 없는 개념도 기록 없이는 finding
//  - concept-driven-tests 불변 "검토 기록은 그 개념의 지문에 묶인다 — 개념을 다시 고치면 지난
//    기록은 효력을 잃는다" → 옛 지문의 기록으로는 통과하지 못한다
//  - concept-driven-tests 정의 "이 동작은 시작 설정의 스위치로 끌 수 있다"
//    → conceptDrivenTests: false면 문지기가 아무 말도 하지 않는다
//  - concept-driven-tests 구성요소 "검사 파일 판별 규칙 … 시작 설정에 적으며, 적지 않으면 흔히
//    쓰는 기본 규칙을 쓴다" → 설정에 적은 규칙으로 검사 파일을 가려낸다
//  - 새로 만든 검사(아직 지도에 없는 파일)도 개념 이름표가 그 개념을 가리키면 따라온 것으로 본다 —
//    concept-code-mapping "이름표가 곧 지도의 원본"과 같은 태도다.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkTestFollow } from '../../src/hooks/gates/testFollowGate.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { readInitConfig } from '../../src/init/readConfig.js';
import { writeConcept, readConcept } from '../../src/store/conceptStore.js';
import { writeMappingCache } from '../../src/mapping/scan.js';
import { writeLock } from '../../src/drift/lock.js';
import { contractHash } from '../../src/drift/hash.js';
import { recordTestReview } from '../../src/concept/testReview.js';
import type { GateInput } from '../../src/hooks/gates/types.js';

let root: string;

async function touch(rel: string, body = '\n') {
  const abs = join(root, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, body, 'utf8');
}

const conceptBody = (definition: string) => ({
  slug: 'pay-rule',
  category: ['behavior'],
  title: '결제 규칙',
  status: 'green',
  description: { definition },
  purpose: { reason: 'r' },
  actions: {},
  principle: {},
});

// 개념 v1을 확정(lock)한 뒤 v2로 바꿔 어긋남을 만든다. related는 지도에 등록할 연결 코드.
async function makeDrift(related: string[]) {
  await writeConcept(root, conceptBody('v1') as never);
  const v1 = await readConcept(root, 'pay-rule');
  await writeLock(root, {
    'pay-rule': { hash: contractHash(v1!), at: '2026-01-01T00:00:00.000Z' },
  });
  await writeMappingCache(root, { 'pay-rule': related });
  await writeConcept(root, conceptBody('v2') as never);
}

async function input(files: string[]): Promise<GateInput> {
  return { root, files, cfg: await readInitConfig(root), report: {} as never };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cp-tfollow-'));
  await scaffoldInit(root, {});
});

describe('concept-test-follow 문지기', () => {
  it('개념만 바뀌고 딸린 검사가 안 오면 붙잡는다 [규칙: 검사가 함께 오지 않은 커밋을 붙잡는다]', async () => {
    await touch('src/pay.ts');
    await touch('tests/pay.test.ts');
    await makeDrift(['src/pay.ts', 'tests/pay.test.ts']);
    const f = await checkTestFollow(await input(['src/pay.ts']));
    expect(f?.gate).toBe('concept-test-follow');
    expect(f?.reason).toContain('pay-rule');
    expect(f?.reason).toContain('tests/pay.test.ts');
  });

  it('딸린 검사가 함께 오면 통과한다 [규칙: 검사를 함께 고쳤으면 넘어간다]', async () => {
    await touch('src/pay.ts');
    await touch('tests/pay.test.ts');
    await makeDrift(['src/pay.ts', 'tests/pay.test.ts']);
    expect(await checkTestFollow(await input(['src/pay.ts', 'tests/pay.test.ts']))).toBeNull();
  });

  it('지도에 아직 없는 새 검사라도 이름표가 그 개념을 가리키면 따라온 것으로 본다', async () => {
    await touch('src/pay.ts');
    await touch('tests/pay.refund.test.ts', '// @concept:pay-rule\n');
    await makeDrift(['src/pay.ts']);
    expect(await checkTestFollow(await input(['tests/pay.refund.test.ts']))).toBeNull();
  });

  it('신선한 검토 기록이 있으면 검사가 안 와도 통과한다 [규칙: 사유를 기록으로 남기면 넘어간다]', async () => {
    await touch('src/pay.ts');
    await touch('tests/pay.test.ts');
    await makeDrift(['src/pay.ts', 'tests/pay.test.ts']);
    const c = await readConcept(root, 'pay-rule');
    await recordTestReview(root, c!, 'no-impact', { note: '문구만 다듬음' });
    expect(await checkTestFollow(await input(['src/pay.ts']))).toBeNull();
  });

  it('옛 지문에 남긴 기록으로는 통과하지 못한다 [규칙: 기록은 개념 지문에 묶인다]', async () => {
    await touch('src/pay.ts');
    await touch('tests/pay.test.ts');
    await writeConcept(root, conceptBody('v1') as never);
    const v1 = await readConcept(root, 'pay-rule');
    await recordTestReview(root, v1!, 'no-impact', { note: '옛 판단' });
    await writeLock(root, {
      'pay-rule': { hash: contractHash(v1!), at: '2026-01-01T00:00:00.000Z' },
    });
    await writeMappingCache(root, { 'pay-rule': ['src/pay.ts', 'tests/pay.test.ts'] });
    await writeConcept(root, conceptBody('v2') as never);
    const f = await checkTestFollow(await input(['src/pay.ts']));
    expect(f?.gate).toBe('concept-test-follow');
  });

  it('딸린 검사가 아예 없어도 기록 없이는 붙잡는다 [규칙: 검사가 없어도 조용히 넘어가지 않는다]', async () => {
    await touch('src/pay.ts');
    await makeDrift(['src/pay.ts']);
    const f = await checkTestFollow(await input(['src/pay.ts']));
    expect(f?.gate).toBe('concept-test-follow');
    expect(f?.reason).toContain('연결된 검사가 없습니다');
  });

  it('딸린 검사가 없고 그 사실을 기록했으면 통과한다 [규칙: 검사가 없다는 사실을 기록으로 명시한다]', async () => {
    await touch('src/pay.ts');
    await makeDrift(['src/pay.ts']);
    const c = await readConcept(root, 'pay-rule');
    await recordTestReview(root, c!, 'no-tests', { note: '아직 검사 없음' });
    expect(await checkTestFollow(await input(['src/pay.ts']))).toBeNull();
  });

  it('바뀐 개념이 없으면 아무 말도 하지 않는다', async () => {
    await touch('src/pay.ts');
    expect(await checkTestFollow(await input(['src/pay.ts']))).toBeNull();
  });

  it('바뀐 개념과 무관한 커밋은 붙잡지 않는다 — 맞물린 개념만 본다 (drift-reconcile의 맞물림 재료 재사용)', async () => {
    await touch('src/pay.ts');
    await touch('src/other.ts');
    await makeDrift(['src/pay.ts']);
    expect(await checkTestFollow(await input(['src/other.ts']))).toBeNull();
  });

  it('스위치를 끄면(conceptDrivenTests: false) 문지기가 동작하지 않는다 [규칙: 스위치로 끌 수 있다]', async () => {
    await touch('src/pay.ts');
    await makeDrift(['src/pay.ts']);
    const base = await input(['src/pay.ts']);
    const off: GateInput = { ...base, cfg: { ...base.cfg!, conceptDrivenTests: false } };
    expect(await checkTestFollow(off)).toBeNull();
  });

  it('설정에 적은 검사 파일 규칙(testGlobs)으로 검사 파일을 가려낸다 [규칙: 판별 규칙은 설정에 적는다]', async () => {
    await touch('src/pay.ts');
    await touch('spec/pay-checks.ts');
    await makeDrift(['src/pay.ts', 'spec/pay-checks.ts']);
    const base = await input(['spec/pay-checks.ts']);
    const custom: GateInput = { ...base, cfg: { ...base.cfg!, testGlobs: ['spec/**'] } };
    expect(await checkTestFollow(custom)).toBeNull();
    // 같은 파일이라도 기본 규칙에서는 검사로 보지 않으므로 붙잡힌다.
    expect(await checkTestFollow(base)).not.toBeNull();
  });
});
