// @concept:pending-diff @concept:settled-status @concept:concept-inline-edit @concept:human-owns-contract
// tests/store/approvedSnapshot.test.ts — 승인본(확정 개념이 검토 중으로 내려가기 직전 내용) 보관을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - pending-diff 수명 "확정 개념이 검토 중으로 내려가는 순간 승인본이 보관된다"
//    → green 개념 편집(저장·edit-concept 흐름 둘 다)이 편집 전 전체 개념을 .approved/<slug>.json에 남긴다
//  - pending-diff 수명 "검토 중인 동안에는 내용을 더 고쳐도 승인본은 그대로 남는다"
//    → 이미 pending인 개념을 다시 고쳐도 승인본 불변 / 이전 status가 green이면 낡은 파일이 있어도 덮어쓴다
//  - pending-diff 수명 "다시 확정되면 승인본은 정리된다" → pending→green에서 삭제, pending→red는 유지
//  - concept-inline-edit 불변 "확정된 개념을 고치면 예외 없이 검토 중 상태로 내려간다" + 불변 규칙 "승인본은
//    개념 목록에 섞이지 않는다" → 승인본 저장 실패면 개념 불변 / 개념 쓰기 실패면 승인본 원상복구
//  - human-owns-contract 불변 "사유가 비면 고치지 않는다" → 사유 거부 시 승인본도 만들지 않는다
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeConcept,
  readConcept,
  listConcepts,
  editConceptContent,
  setConceptStatus,
} from '../../src/store/conceptStore.js';
import { editConceptWithNote } from '../../src/store/conceptEdit.js';
import {
  saveApprovedSnapshot,
  readApprovedSnapshot,
  removeApprovedSnapshot,
} from '../../src/store/approvedSnapshot.js';
import { recordAttest } from '../../src/concept/attest.js';
import { parseConcept } from '../../src/schema/concept.js';
import { cpPaths } from '../../src/paths.js';

const base = {
  slug: 'admin-role',
  group: 'auth',
  category: ['role'],
  title: 'Admin Role',
  description: { definition: 'd' },
  state: { managed: ['이 개념이 관리하는 대상'] },
  purpose: { reason: 'r' },
  actions: {},
  principle: {
    immutableRules: ['이 개념의 규칙은 열 글자 이상이다'],
    operationalPrinciple: '조건이 갖춰지면 그대로 판정된다',
  },
  sources: [{ kind: 'decision', locator: '2026-09-12', supports: '검사용 결정' }],
};
let root: string;
const snapFile = (slug = 'admin-role') => join(cpPaths(root).approvedDir, `${slug}.json`);
const conceptFile = () => join(cpPaths(root).conceptsData, 'auth', 'admin-role.json');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-approved-'));
});
afterEach(() => {
  try {
    chmodSync(join(cpPaths(root).conceptsData, 'auth'), 0o755);
  } catch {
    /* 폴더가 없으면 무시 */
  }
});

describe('approvedSnapshot 저장소', () => {
  it('저장한 승인본을 그대로 읽고, 없으면 null이다', async () => {
    expect(await readApprovedSnapshot(root, 'admin-role')).toBeNull();
    const c = parseConcept({ ...base, status: 'green' });
    await saveApprovedSnapshot(root, c);
    const snap = await readApprovedSnapshot(root, 'admin-role');
    expect(snap?.slug).toBe('admin-role');
    expect(snap?.concept).toEqual(c);
    expect(Number.isNaN(Date.parse(snap!.savedAt))).toBe(false);
  });
  it('형식이 깨진 승인본은 Error를 던진다', async () => {
    mkdirSync(cpPaths(root).approvedDir, { recursive: true });
    writeFileSync(snapFile(), '{ nope');
    await expect(readApprovedSnapshot(root, 'admin-role')).rejects.toThrow(/Malformed approved/);
    writeFileSync(snapFile(), JSON.stringify({ slug: 'other', savedAt: 'x', concept: {} }));
    await expect(readApprovedSnapshot(root, 'admin-role')).rejects.toThrow(/Malformed approved/);
    writeFileSync(
      snapFile(),
      JSON.stringify({ slug: 'admin-role', savedAt: 'nope', concept: base })
    );
    await expect(readApprovedSnapshot(root, 'admin-role')).rejects.toThrow(/savedAt/);
  });
  it('삭제는 없어도 조용히 끝난다', async () => {
    await expect(removeApprovedSnapshot(root, 'admin-role')).resolves.toBeUndefined();
  });
  it('경로 탈출 slug는 거부한다', async () => {
    for (const bad of ['../evil', 'a/b', '..', '', 'A_b']) {
      await expect(readApprovedSnapshot(root, bad)).rejects.toThrow();
      await expect(removeApprovedSnapshot(root, bad)).rejects.toThrow();
    }
    const c = { ...parseConcept(base), slug: '../evil' };
    await expect(saveApprovedSnapshot(root, c)).rejects.toThrow();
  });
});

describe('green 개념 편집 → 승인본 보관', () => {
  it('편집 전 전체 개념을 승인본으로 저장한다', async () => {
    await writeConcept(root, { ...base, status: 'green' });
    const before = await readConcept(root, 'admin-role');
    const r = await editConceptContent(root, 'admin-role', { title: 'New' });
    expect(r.downgradedToPending).toBe(true);
    const snap = await readApprovedSnapshot(root, 'admin-role');
    expect(snap?.concept).toEqual(before);
    expect(snap?.concept.status).toBe('green');
    expect(snap?.concept.title).toBe('Admin Role');
    expect((await readConcept(root, 'admin-role'))?.status).toBe('pending');
  });
  it('edit-concept(사유 동반) 흐름도 똑같이 보관한다', async () => {
    await writeConcept(root, { ...base, status: 'green' });
    await editConceptWithNote(root, 'admin-role', { title: 'New' }, '용어 정리');
    expect((await readApprovedSnapshot(root, 'admin-role'))?.concept.title).toBe('Admin Role');
  });
  it('사유가 비어 거부되면 승인본도 만들지 않는다', async () => {
    await writeConcept(root, { ...base, status: 'green' });
    await expect(editConceptWithNote(root, 'admin-role', { title: 'New' }, ' ')).rejects.toThrow();
    expect(existsSync(snapFile())).toBe(false);
  });
  it('스키마 검증에 걸려 거부되면 승인본을 만들지 않는다(쓰기 전 검증이 먼저)', async () => {
    await writeConcept(root, { ...base, status: 'green' });
    await expect(
      editConceptContent(root, 'admin-role', { description: { definition: '' } })
    ).rejects.toThrow();
    expect(existsSync(snapFile())).toBe(false);
    expect((await readConcept(root, 'admin-role'))?.status).toBe('green');
  });
  it('이미 pending인 개념을 다시 고쳐도 승인본은 그대로다', async () => {
    await writeConcept(root, { ...base, status: 'green' });
    await editConceptContent(root, 'admin-role', { title: 'v2' });
    const first = readFileSync(snapFile(), 'utf8');
    const r = await editConceptContent(root, 'admin-role', { title: 'v3' });
    expect(r.downgradedToPending).toBe(false);
    expect(readFileSync(snapFile(), 'utf8')).toBe(first);
  });
  it('pending/red 개념의 편집은 승인본을 만들지 않고 건드리지도 않는다', async () => {
    await writeConcept(root, { ...base, status: 'pending' });
    await editConceptContent(root, 'admin-role', { title: 'v2' });
    expect(existsSync(snapFile())).toBe(false);
    await writeConcept(root, { ...base, status: 'red' });
    mkdirSync(cpPaths(root).approvedDir, { recursive: true });
    writeFileSync(snapFile(), 'sentinel');
    await editConceptContent(root, 'admin-role', { title: 'v3' });
    expect(readFileSync(snapFile(), 'utf8')).toBe('sentinel');
  });
  it('이전 status가 green이면 낡은 승인본 파일이 있어도 덮어쓴다', async () => {
    mkdirSync(cpPaths(root).approvedDir, { recursive: true });
    writeFileSync(snapFile(), 'stale');
    await writeConcept(root, { ...base, status: 'green' });
    await editConceptContent(root, 'admin-role', { title: 'New' });
    expect((await readApprovedSnapshot(root, 'admin-role'))?.concept.title).toBe('Admin Role');
  });
});

describe('저장 실패 시 원상 유지', () => {
  it('승인본 저장이 실패하면 개념은 바뀌지 않는다', async () => {
    await writeConcept(root, { ...base, status: 'green' });
    const before = readFileSync(conceptFile(), 'utf8');
    mkdirSync(join(cpPaths(root).base, 'concepts'), { recursive: true });
    writeFileSync(cpPaths(root).approvedDir, 'file, not a folder'); // 폴더를 만들 수 없게 막는다
    await expect(editConceptContent(root, 'admin-role', { title: 'New' })).rejects.toThrow();
    expect(readFileSync(conceptFile(), 'utf8')).toBe(before);
  });
  const itNotRoot = process.getuid?.() === 0 ? it.skip : it;
  itNotRoot('개념 쓰기가 실패하면 방금 쓴 승인본을 없앤다', async () => {
    await writeConcept(root, { ...base, status: 'green' });
    const before = readFileSync(conceptFile(), 'utf8');
    chmodSync(join(cpPaths(root).conceptsData, 'auth'), 0o555);
    await expect(editConceptContent(root, 'admin-role', { title: 'New' })).rejects.toThrow();
    expect(existsSync(snapFile())).toBe(false);
    expect(readFileSync(conceptFile(), 'utf8')).toBe(before);
  });
  itNotRoot('개념 쓰기가 실패하면 직전 승인본을 그 내용으로 복원한다', async () => {
    mkdirSync(cpPaths(root).approvedDir, { recursive: true });
    writeFileSync(snapFile(), 'previous-snapshot');
    await writeConcept(root, { ...base, status: 'green' });
    chmodSync(join(cpPaths(root).conceptsData, 'auth'), 0o555);
    await expect(editConceptContent(root, 'admin-role', { title: 'New' })).rejects.toThrow();
    expect(readFileSync(snapFile(), 'utf8')).toBe('previous-snapshot');
  });
});

describe('상태 전이와 승인본', () => {
  async function pendingWithSnapshot() {
    await writeConcept(root, { ...base, status: 'green' });
    await editConceptContent(root, 'admin-role', { title: 'v2' });
    expect(existsSync(snapFile())).toBe(true);
  }
  it('pending→green이 되면 승인본을 삭제한다', async () => {
    await pendingWithSnapshot();
    await recordAttest(root, (await readConcept(root, 'admin-role'))!, 'pass');
    await setConceptStatus(root, 'admin-role', 'green');
    expect(existsSync(snapFile())).toBe(false);
  });
  it('pending→red가 되어도 승인본은 남는다', async () => {
    await pendingWithSnapshot();
    await setConceptStatus(root, 'admin-role', 'red');
    expect(existsSync(snapFile())).toBe(true);
  });
});

describe('개념 목록과 섞이지 않는다', () => {
  it('승인본이 있어도 listConcepts는 개념만 돌려준다', async () => {
    await writeConcept(root, { ...base, status: 'green' });
    await editConceptContent(root, 'admin-role', { title: 'v2' });
    expect(existsSync(snapFile())).toBe(true);
    const all = await listConcepts(root);
    expect(all.map((c) => c.slug)).toEqual(['admin-role']);
    expect(all[0].status).toBe('pending');
  });
});
