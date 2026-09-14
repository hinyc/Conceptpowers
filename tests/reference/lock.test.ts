// @concept:reference-sync @concept:reference-privacy
// tests/reference/lock.test.ts
// 참고자료 기준점(reference.lock.json)의 읽기·쓰기·찍기를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-sync 생애주기 "기준점 없음 — 모든 자료가 새 자료로 보인다"
//    → 기준점이 없거나 깨졌으면 null(빈 기준점과 구별한다)
//  - reference-sync 허용 "사람이 명시적으로 명령하면 현재 참고자료 전체의 지문을 기준점으로 찍는 것"
//    → 찍으면 저장소 안·등록 폴더 파일 전부의 지문이 열쇠 오름차순으로 담긴다 / 찍은 시각을 주입할 수 있다
//    → 읽지 못한 파일은 조용히 빠지지 않고 skipped 수로 알린다
//  - reference-sync 불변 "기준점에는 자료의 지문·크기·시각만 남기고 내용은 남기지 않는다"
//    → 기준점 파일 본문에 자료 내용이 없다
//  - reference-privacy 불변 "도구는 사람이 넣은 참고자료를 읽기만 하고 그 내용을 고치지 않는다"
//    → 찍은 뒤에도 참고자료 파일의 수정 시각이 그대로다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, stat, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readReferenceLock,
  writeReferenceLock,
  snapshotReference,
} from '../../src/reference/lock.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { cpPaths } from '../../src/paths.js';

const AT = '2026-09-14T00:00:00.000Z';
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cp-rlock-'));
  await scaffoldInit(root, {});
});

describe('readReferenceLock', () => {
  it('없으면 null', async () => {
    expect(await readReferenceLock(root)).toBeNull();
  });
  it('깨진 JSON이면 null', async () => {
    await mkdir(cpPaths(root).alignmentDir, { recursive: true });
    await writeFile(cpPaths(root).referenceLock, '{not json', 'utf8');
    expect(await readReferenceLock(root)).toBeNull();
  });
  it('쓴 것을 그대로 읽는다', async () => {
    const lock = {
      version: 1 as const,
      at: AT,
      files: { 'docs/conceptpowers/reference/a.md': { hash: 'abc', size: 3, mtime: AT } },
      truncated: [],
    };
    await writeReferenceLock(root, lock);
    expect(await readReferenceLock(root)).toEqual(lock);
  });
});

describe('snapshotReference', () => {
  it('저장소 안·등록 폴더 파일 전부의 지문을 열쇠 오름차순으로 담는다', async () => {
    const ref = cpPaths(root).reference;
    await writeFile(join(ref, 'z.md'), '비밀 본문 z');
    await mkdir(join(root, 'ext'), { recursive: true });
    await writeFile(join(root, 'ext', 'a.pdf'), 'pdf');
    await writeFile(join(ref, 'paths.md'), '- ext/\n', 'utf8');

    const r = await snapshotReference(root, AT);
    expect(r.repo).toBe(1);
    expect(r.external).toBe(1);
    expect(Object.keys(r.lock.files)).toEqual(['docs/conceptpowers/reference/z.md', 'ext/a.pdf']);
    expect(r.lock.at).toBe(AT);
    expect(r.lock.files['ext/a.pdf']).toMatchObject({ size: 3 });
    expect(r.skipped).toBe(0);

    const raw = await readFile(cpPaths(root).referenceLock, 'utf8');
    expect(raw).not.toContain('비밀 본문');
    expect(await readReferenceLock(root)).toEqual(r.lock);
  });

  it('찍은 뒤에도 참고자료 파일은 그대로다', async () => {
    const p = join(cpPaths(root).reference, 'a.md');
    await writeFile(p, '자료');
    const before = await stat(p);
    await snapshotReference(root, AT);
    expect((await stat(p)).mtimeMs).toBe(before.mtimeMs);
  });

  it('읽지 못한 파일은 기준점에서 빼되 skipped로 알린다', async () => {
    const ref = cpPaths(root).reference;
    await writeFile(join(ref, 'ok.md'), '자료');
    await writeFile(join(ref, 'locked.md'), '잠김');
    await chmod(join(ref, 'locked.md'), 0o000);
    try {
      const r = await snapshotReference(root, AT);
      expect(Object.keys(r.lock.files)).toEqual(['docs/conceptpowers/reference/ok.md']);
      expect(r.skipped).toBe(1);
    } finally {
      await chmod(join(ref, 'locked.md'), 0o644);
    }
  });

  it('닿지 않는 등록 경로는 unreachable로 보고하고 기준점에는 넣지 않는다', async () => {
    await writeFile(join(cpPaths(root).reference, 'paths.md'), '- nope/\n', 'utf8');
    const r = await snapshotReference(root, AT);
    expect(r.unreachable).toEqual(['nope/']);
    expect(r.lock.files).toEqual({});
  });
});
