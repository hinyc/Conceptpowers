// @concept:reference-sync @concept:reference-first-duty
// tests/reference/diff.test.ts
// 현재 참고자료와 기준점을 견줘 추가·변경·삭제와 영향 개념을 가려내는 것을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-sync 생애주기 "기준점 없음 — 모든 자료가 새 자료로 보인다"
//    → 기준점이 없으면 unlocked이고 전부 added, 영향 개념은 없다
//  - reference-sync 허용 "현재 자료를 기준점과 견줘 추가·변경·삭제를 가려내는 것"
//    → 그대로면 빈 diff / 내용을 고치면 changed / 지우면 removed / 새 파일은 added
//  - reference-sync 허용 "변경·삭제된 자료를 근거 목록에 적은 개념을 영향 개념으로 골라내는 것"
//    + 허용 "어떤 개념도 근거로 삼지 않은 새 자료를 새 개념 후보로 따로 보고하는 것"
//    → changed·removed만 영향 개념을 낳고 added는 영향 개념에 들지 않는다
//    → added 가운데 어떤 개념도 근거로 삼지 않은 것만 newMaterial(새 개념 후보)이다
//  - reference-sync 불변 "닿지 않는 위치의 자료는 삭제로 세지 않는다"
//    → 기준점에 있던 등록 폴더가 이 기기에 없으면 unreachable이고 removed·영향 개념에 들지 않는다
//  - reference-first-duty 정의 "코드를 판단할 때는 다시 읽지 않는다"(값싼 견주기)
//    → quick 모드는 크기·시각이 같으면 내용을 읽지 않아 같은 크기·시각의 변경을 못 보고,
//      full 모드는 잡아낸다 / 시각만 바뀌고 내용이 같으면 quick도 변경으로 치지 않는다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffReference, isEmptyDiff } from '../../src/reference/diff.js';
import { snapshotReference, writeReferenceLock } from '../../src/reference/lock.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { writeConcept } from '../../src/store/conceptStore.js';
import { cpPaths } from '../../src/paths.js';

const AT = '2026-09-14T00:00:00.000Z';
let root: string;
let refDir: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cp-rdiff-'));
  await scaffoldInit(root, {});
  refDir = cpPaths(root).reference;
});

async function citingConcept(slug: string, path: string): Promise<void> {
  await writeConcept(root, {
    slug,
    category: ['behavior'],
    status: 'green',
    title: slug,
    description: { definition: '정의' },
    purpose: { reason: '이유' },
    actions: {},
    principle: {},
    sources: [{ kind: 'reference', path, locator: '§1', supports: '규칙' }],
  });
}

describe('diffReference', () => {
  it('기준점이 없으면 unlocked이고 전부 added, 영향 개념 없음', async () => {
    await writeFile(join(refDir, 'a.md'), '자료');
    await citingConcept('c1', 'docs/conceptpowers/reference/a.md');
    const d = await diffReference(root);
    expect(d.unlocked).toBe(true);
    expect(d.added).toEqual(['docs/conceptpowers/reference/a.md']);
    expect(d.changed).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.affected).toEqual([]);
    expect(isEmptyDiff(d)).toBe(false);
  });

  it('그대로면 빈 diff', async () => {
    await writeFile(join(refDir, 'a.md'), '자료');
    await snapshotReference(root, AT);
    const d = await diffReference(root);
    expect(d.unlocked).toBe(false);
    expect(isEmptyDiff(d)).toBe(true);
  });

  it('고치면 changed + 영향 개념, 지우면 removed + 영향 개념, 새 파일은 added만', async () => {
    await writeFile(join(refDir, 'a.md'), '자료 a');
    await writeFile(join(refDir, 'b.md'), '자료 b');
    await citingConcept('cite-a', 'docs/conceptpowers/reference/a.md');
    await citingConcept('cite-b', 'b.md');
    await snapshotReference(root, AT);

    await writeFile(join(refDir, 'a.md'), '자료 a — 고침');
    await rm(join(refDir, 'b.md'));
    await writeFile(join(refDir, 'c.md'), '새 자료');
    await citingConcept('cite-c', 'docs/conceptpowers/reference/c.md');

    const d = await diffReference(root);
    expect(d.changed).toEqual(['docs/conceptpowers/reference/a.md']);
    expect(d.removed).toEqual(['docs/conceptpowers/reference/b.md']);
    expect(d.added).toEqual(['docs/conceptpowers/reference/c.md']);
    expect(d.affected.map((a) => a.slug)).toEqual(['cite-a', 'cite-b']);
    expect(isEmptyDiff(d)).toBe(false);
  });

  it('추가 파일 가운데 어떤 개념도 근거로 삼지 않은 것만 newMaterial이다', async () => {
    await writeFile(join(refDir, 'a.md'), '자료');
    await snapshotReference(root, AT);
    await writeFile(join(refDir, 'cited.md'), '이미 인용됨');
    await writeFile(join(refDir, 'fresh.md'), '아무도 안 봄');
    await citingConcept('cite-new', 'docs/conceptpowers/reference/cited.md');
    const d = await diffReference(root);
    expect(d.added).toEqual([
      'docs/conceptpowers/reference/cited.md',
      'docs/conceptpowers/reference/fresh.md',
    ]);
    expect(d.newMaterial).toEqual(['docs/conceptpowers/reference/fresh.md']);
    expect(d.affected).toEqual([]);
  });

  it('기준점에 있던 등록 폴더가 이 기기에 없으면 unreachable이고 removed·영향에 들지 않는다', async () => {
    await citingConcept('cite-ext', 'x.pdf');
    await writeFile(join(refDir, 'paths.md'), '- gone/\n', 'utf8');
    await writeReferenceLock(root, {
      version: 1,
      at: AT,
      files: { 'gone/x.pdf': { hash: 'abc', size: 1, mtime: AT } },
      truncated: [],
    });
    const d = await diffReference(root);
    expect(d.unreachable).toEqual(['gone/']);
    expect(d.removed).toEqual([]);
    expect(d.affected).toEqual([]);
    expect(isEmptyDiff(d)).toBe(true);
  });

  it('quick 모드는 크기·시각이 같은 변경을 못 보고 full 모드는 잡아낸다', async () => {
    const p = join(refDir, 'a.md');
    await writeFile(p, 'abcd');
    await snapshotReference(root, AT);
    const s = await stat(p);
    await writeFile(p, 'abce');
    await utimes(p, s.atime, s.mtime);
    expect((await diffReference(root, 'quick')).changed).toEqual([]);
    expect((await diffReference(root, 'full')).changed).toEqual([
      'docs/conceptpowers/reference/a.md',
    ]);
  });

  it('시각만 바뀌고 내용이 같으면 quick도 변경으로 치지 않는다', async () => {
    const p = join(refDir, 'a.md');
    await writeFile(p, 'abcd');
    await snapshotReference(root, AT);
    const later = new Date(Date.now() + 60_000);
    await utimes(p, later, later);
    expect((await diffReference(root, 'quick')).changed).toEqual([]);
  });

  it('등록 폴더의 파일도 같은 규칙으로 견준다', async () => {
    await mkdir(join(root, 'ext'), { recursive: true });
    await writeFile(join(root, 'ext', 'x.pdf'), 'v1');
    await writeFile(join(refDir, 'paths.md'), '- ext/\n', 'utf8');
    await citingConcept('cite-x', 'x.pdf');
    await snapshotReference(root, AT);
    await writeFile(join(root, 'ext', 'x.pdf'), 'v2!');
    const d = await diffReference(root);
    expect(d.changed).toEqual(['ext/x.pdf']);
    expect(d.affected).toEqual([{ slug: 'cite-x', status: 'green', sourcePaths: ['x.pdf'] }]);
  });
});
