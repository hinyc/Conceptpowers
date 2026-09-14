// @concept:governance-mode @concept:settled-status
// tests/hooks/evidenceGate.test.ts
// 고쳐진 개념과 맞물린 커밋에 판정 근거 기록(검사 증빙·검토 기록·코드무관 기록)의 지금 내용이 함께 들어오는지
// 검사하는 문지기를 실제 git 저장소와 실제 커밋 범위(커밋될 트리)로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 불변 "고쳐진 개념과 맞물린 커밋에는 판정에 쓰이는 검사 증빙·검토 기록·코드무관 기록의
//    지금 내용이 함께 들어와야 한다 — 기록이 저장소에 남지 않으면 증빙이 아니다"
//    → 달라진 기록 파일이 이번 커밋에 안 들어오면 잡는다(수정·새 파일·경로 지정 커밋에서 빠짐)
//    → 스테이징한 뒤 기록을 또 고쳐 커밋될 내용이 디스크와 다르면 잡는다
//    → 추적 제외 표시(skip-worktree)·clean filter로 커밋될 내용을 바꿔 끼워도 잡는다
//    → 기록 파일이 커밋에 들어오면 통과 / git commit -a처럼 디스크 내용이 커밋되는 범위면 통과
//    → 개념 문서 없이 연결 코드만 들어온 맞물린 커밋에도 요구한다
//    → 맞물리지 않은 커밋은 기록이 달라져 있어도 붙잡지 않는다 / git을 읽지 못하면 던진다
//  - governance-mode 불변 "문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다"
//    → 커밋될 내용은 추측하지 않고 커밋될 트리에서 읽는다
//  - settled-status 불변 "… 다른 개념과 충돌하지 않는지 검사한 기록이 있을 것(검사 증빙)"
//    → 증빙은 디스크가 아니라 커밋에 남아야 팀원과 다음 세션이 본다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkEvidenceStaged } from '../../src/hooks/gates/evidenceGate.js';
import { snapshotCommit } from '../../src/hooks/command/commitTree.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { writeConcept, readConcept } from '../../src/store/conceptStore.js';
import { recordAttest } from '../../src/concept/attest.js';
import { recordNoCode } from '../../src/drift/noCode.js';
import { recordTestReview } from '../../src/concept/testReview.js';
import { writeLock } from '../../src/drift/lock.js';
import { writeMappingCache } from '../../src/mapping/scan.js';
import { contractHash } from '../../src/drift/hash.js';
import type { GateInput } from '../../src/hooks/gates/types.js';
import type { CommitScope } from '../../src/hooks/command/commitArgs.js';

const DOC = 'docs/conceptpowers/concepts/data/auth-token.json';
const ATTEST = 'docs/conceptpowers/concepts/.alignment/attest.json';
let root: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: root }).toString();
const body = (definition: string) => ({
  slug: 'auth-token',
  category: ['behavior'],
  title: 'A',
  description: { definition },
  purpose: { reason: 'r' },
  actions: {},
  principle: { immutableRules: ['결제 완료 후 price 변경 불가'] },
});
const current = async () => (await readConcept(root, 'auth-token'))!;
const attest = async () => recordAttest(root, await current(), 'pass', { compared: ['x'] });
const stageDoc = async (definition: string) => {
  await writeConcept(root, body(definition));
  git('add', DOC);
};
const commitAttest = () => {
  git('add', ATTEST);
  git('commit', '-qm', 'attest');
};
async function inputFor(scope: CommitScope, pathspecs: string[] = []): Promise<GateInput> {
  const snap = await snapshotCommit(root, { kind: 'commit', scope, pathspecs });
  return { root, files: snap.files, cfg: null, report: {} as never, commit: snap.content };
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'cp-evidence-'));
  await scaffoldInit(root, {});
  await writeConcept(root, body('v1'));
  git('init', '-q');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 'T');
  git('add', '-A');
  git('commit', '-qm', 'init');
});

describe('evidence-staged 문지기', () => {
  it('개념 문서만 들어오고 달라진 증빙 파일이 빠지면 잡는다 [규칙: 기록이 저장소에 남지 않으면 증빙이 아니다]', async () => {
    await stageDoc('v2');
    await attest();
    const f = await checkEvidenceStaged(await inputFor('index'));
    expect(f?.gate).toBe('evidence-staged');
    expect(f?.reason).toContain('attest.json');
  });
  it('아직 추적되지 않은 새 기록 파일(no-code.json)도 잡는다', async () => {
    await stageDoc('v2');
    await recordNoCode(root, await current(), '문구만 다듬음');
    const f = await checkEvidenceStaged(await inputFor('index'));
    expect(f?.reason).toContain('no-code.json');
    expect(f?.reason).not.toContain('attest.json');
  });
  it('기록 파일을 스테이징해 함께 넣으면 통과한다', async () => {
    await stageDoc('v2');
    await attest();
    git('add', ATTEST);
    expect(await checkEvidenceStaged(await inputFor('index'))).toBeNull();
  });
  it('스테이징한 뒤 기록을 또 고쳐 커밋될 내용이 디스크와 다르면 잡는다', async () => {
    await stageDoc('v2');
    await attest();
    git('add', ATTEST);
    await stageDoc('v3');
    await attest();
    const f = await checkEvidenceStaged(await inputFor('index'));
    expect(f?.reason).toContain('attest.json');
  });
  it('git commit -a처럼 디스크 내용이 커밋되는 범위면 스테이징하지 않아도 통과한다', async () => {
    await attest();
    commitAttest();
    await stageDoc('v2');
    await attest();
    expect(await checkEvidenceStaged(await inputFor('all'))).toBeNull();
  });
  it('기록을 스테이징했어도 경로 지정 커밋에서 빠지면 잡는다', async () => {
    await stageDoc('v2');
    await attest();
    git('add', ATTEST);
    const f = await checkEvidenceStaged(await inputFor('only', [DOC]));
    expect(f?.reason).toContain('attest.json');
  });
  it('추적 제외 표시(skip-worktree)로 변경을 숨겨도 잡는다', async () => {
    await attest();
    commitAttest();
    git('update-index', '--skip-worktree', ATTEST);
    await stageDoc('v2');
    await attest();
    const f = await checkEvidenceStaged(await inputFor('index'));
    expect(f?.reason).toContain('attest.json');
  });
  it('clean filter로 커밋될 내용을 마지막 커밋 내용으로 바꿔 끼워도 잡는다', async () => {
    await attest();
    commitAttest();
    appendFileSync(join(root, '.git/info/attributes'), `${ATTEST} filter=forge\n`);
    git('config', 'filter.forge.clean', `cat >/dev/null; git show HEAD:${ATTEST}`);
    await stageDoc('v2');
    await attest();
    git('add', ATTEST);
    const f = await checkEvidenceStaged(await inputFor('index'));
    expect(f?.reason).toContain('attest.json');
  });
  it('개념 문서 없이 연결 코드만 들어온 맞물린 커밋에도 요구한다', async () => {
    const v1 = await current();
    await writeLock(root, {
      'auth-token': { hash: contractHash(v1), at: '2026-01-01T00:00:00.000Z' },
    });
    await writeMappingCache(root, { 'auth-token': ['src/a.ts'] });
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/a.ts'), '// @concept:auth-token\nexport const a = 1;\n');
    git('add', '-A');
    git('commit', '-qm', 'lock');
    await writeConcept(root, body('v2'));
    await recordTestReview(root, await current(), 'no-impact', { note: 'n' });
    writeFileSync(join(root, 'src/a.ts'), '// @concept:auth-token\nexport const a = 2;\n');
    git('add', 'src/a.ts');
    const f = await checkEvidenceStaged(await inputFor('index'));
    expect(f?.reason).toContain('test-review.json');
  });
  it('맞물리지 않은 커밋은 기록이 달라져 있어도 붙잡지 않는다', async () => {
    await attest();
    writeFileSync(join(root, 'src.ts'), '// @concept:none\nexport const a = 1;\n');
    git('add', 'src.ts');
    expect(await checkEvidenceStaged(await inputFor('index'))).toBeNull();
  });
  it('기록 파일에 변경이 없으면 통과한다', async () => {
    await stageDoc('v2');
    expect(await checkEvidenceStaged(await inputFor('index'))).toBeNull();
  });
  it('git 저장소가 아니면 판정을 던진다 — 조용히 통과시키지 않는다', async () => {
    const bare = mkdtempSync(join(tmpdir(), 'cp-evidence-nogit-'));
    await scaffoldInit(bare, {});
    await expect(
      checkEvidenceStaged({ root: bare, files: [DOC], cfg: null, report: {} as never })
    ).rejects.toThrow();
  });
});
