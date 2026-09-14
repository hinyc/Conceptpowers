// @concept:governance-mode @concept:settled-status
// tests/hooks/evidenceGate.test.ts
// 고쳐진 개념과 맞물린 커밋에 판정 근거 기록(검사 증빙·검토 기록·코드무관 기록)의 지금 내용이 함께 들어오는지
// 검사하는 문지기를 실제 git 저장소로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 불변 "고쳐진 개념과 맞물린 커밋에는 그 판정에 쓰이는 검사 증빙·검토 기록·코드무관 기록의
//    지금 내용이 함께 들어와야 한다 — 기록이 저장소에 남지 않으면 증빙이 아니다"
//    → 마지막 커밋과 달라진 기록 파일이 이번 커밋에 안 들어오면 잡는다(수정·새 파일·경로 지정 커밋에서 빠짐)
//    → 스테이징한 내용이 디스크의 기록과 다르면(일부만 스테이징) 잡는다
//    → 추적 제외 표시(skip-worktree)로 변경을 숨겨도 잡는다
//    → 기록 파일이 커밋에 들어오면 통과 / git commit -a처럼 디스크 내용이 커밋에 들어가는 범위면 통과
//    → 개념 문서 없이 연결 코드만 들어온 맞물린 커밋에도 요구한다
//    → 맞물리지 않은 커밋은 기록이 달라져 있어도 붙잡지 않는다 / git을 읽지 못하면 던진다
//  - settled-status 불변 "… 다른 개념과 충돌하지 않는지 검사한 기록이 있을 것(검사 증빙)"
//    → 증빙은 디스크가 아니라 커밋에 남아야 팀원과 다음 세션이 본다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkEvidenceStaged } from '../../src/hooks/gates/evidenceGate.js';
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
const ALIGN = 'docs/conceptpowers/concepts/.alignment';
const ATTEST = `${ALIGN}/attest.json`;
let root: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: root }).toString();
const input = (files: string[], scope?: CommitScope): GateInput => ({
  root,
  files,
  cfg: null,
  report: {} as never,
  ...(scope ? { scope } : {}),
});
const body = (definition: string) => ({
  slug: 'auth-token',
  category: ['behavior'],
  title: 'A',
  description: { definition },
  purpose: { reason: 'r' },
  actions: {},
  principle: { immutableRules: ['결제 완료 후 price 변경 불가'] },
});
const attest = async () =>
  recordAttest(root, (await readConcept(root, 'auth-token'))!, 'pass', { compared: ['x'] });

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
    await attest();
    const f = await checkEvidenceStaged(input([DOC]));
    expect(f?.gate).toBe('evidence-staged');
    expect(f?.reason).toContain('attest.json');
  });
  it('아직 추적되지 않은 새 기록 파일(no-code.json)도 잡는다', async () => {
    await recordNoCode(root, (await readConcept(root, 'auth-token'))!, '문구만 다듬음');
    const f = await checkEvidenceStaged(input([DOC]));
    expect(f?.reason).toContain('no-code.json');
    expect(f?.reason).not.toContain('attest.json');
  });
  it('기록 파일을 스테이징해 함께 넣으면 통과한다', async () => {
    await attest();
    git('add', ATTEST);
    expect(await checkEvidenceStaged(input([DOC, ATTEST], 'index'))).toBeNull();
  });
  it('스테이징한 뒤 기록을 또 고쳐 디스크와 스테이징 내용이 다르면 잡는다', async () => {
    await attest();
    git('add', ATTEST);
    await writeConcept(root, body('v2'));
    await attest();
    const f = await checkEvidenceStaged(input([DOC, ATTEST], 'index'));
    expect(f?.reason).toContain('attest.json');
  });
  it('git commit -a처럼 디스크 내용이 커밋에 들어가는 범위면 스테이징하지 않아도 통과한다', async () => {
    await attest();
    expect(await checkEvidenceStaged(input([DOC, ATTEST], 'all'))).toBeNull();
  });
  it('기록을 스테이징했어도 경로 지정 커밋에서 빠지면 잡는다', async () => {
    await attest();
    git('add', ATTEST);
    const f = await checkEvidenceStaged(input([DOC], 'only'));
    expect(f?.reason).toContain('attest.json');
  });
  it('추적 제외 표시(skip-worktree)로 변경을 숨겨도 잡는다', async () => {
    await attest();
    git('add', ATTEST);
    git('commit', '-qm', 'attest');
    git('update-index', '--skip-worktree', ATTEST);
    await writeConcept(root, body('v2'));
    await attest();
    const f = await checkEvidenceStaged(input([DOC], 'index'));
    expect(f?.reason).toContain('attest.json');
  });
  it('개념 문서 없이 연결 코드만 들어온 맞물린 커밋에도 요구한다', async () => {
    const v1 = await readConcept(root, 'auth-token');
    await writeLock(root, {
      'auth-token': { hash: contractHash(v1!), at: '2026-01-01T00:00:00.000Z' },
    });
    await writeMappingCache(root, { 'auth-token': ['src/a.ts'] });
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/a.ts'), '// @concept:auth-token\nexport const a = 1;\n');
    git('add', '-A');
    git('commit', '-qm', 'lock');
    await writeConcept(root, body('v2'));
    await recordTestReview(root, (await readConcept(root, 'auth-token'))!, 'no-impact', {
      note: 'n',
    });
    const f = await checkEvidenceStaged(input(['src/a.ts'], 'index'));
    expect(f?.reason).toContain('test-review.json');
  });
  it('맞물리지 않은 커밋은 기록이 달라져 있어도 붙잡지 않는다', async () => {
    await attest();
    writeFileSync(join(root, 'src.ts'), '// @concept:none\nexport const a = 1;\n');
    expect(await checkEvidenceStaged(input(['src.ts']))).toBeNull();
  });
  it('기록 파일에 변경이 없으면 통과한다', async () => {
    expect(await checkEvidenceStaged(input([DOC]))).toBeNull();
  });
  it('git 저장소가 아니면 판정을 던진다 — 조용히 통과시키지 않는다', async () => {
    const bare = mkdtempSync(join(tmpdir(), 'cp-evidence-nogit-'));
    await scaffoldInit(bare, {});
    await expect(
      checkEvidenceStaged({ root: bare, files: [DOC], cfg: null, report: {} as never })
    ).rejects.toThrow();
  });
});
