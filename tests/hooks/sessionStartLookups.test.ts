// @concept:reference-sync
// tests/hooks/sessionStartLookups.test.ts
// 세션 시작의 참고자료 변경 알림이 이미 읽은 재료를 다시 조회하지 않는지, 다른 기기 표기의 닿지 않는
// 등록을 삭제로 알리지 않는지 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-sync 불변 "세션 시작 알림은 실패해도 세션을 막지 않는다" (값싸게 — 같은 조회를 되풀이하지 않는다)
//    → 세션 시작 한 번에 등록 경로 검증·참고자료 목록 읽기가 각각 한 번만 일어난다
//  - reference-sync 불변 "닿지 않는 위치의 자료는 삭제로 세지 않는다"
//    → 다른 기기의 홈 절대 경로로 적힌 닿지 않는 등록이면 ~/… 기준점 열쇠를 알림에 올리지 않는다
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../src/init/referencePaths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/init/referencePaths.js')>();
  return { ...actual, checkReferencePaths: vi.fn(actual.checkReferencePaths) };
});
vi.mock('../../src/init/reference.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/init/reference.js')>();
  return { ...actual, listReferenceFiles: vi.fn(actual.listReferenceFiles) };
});

const { buildSessionStartOutput } = await import('../../src/hooks/sessionStart.js');
const { checkReferencePaths } = await import('../../src/init/referencePaths.js');
const { listReferenceFiles } = await import('../../src/init/reference.js');
const { scaffoldInit } = await import('../../src/init/scaffold.js');
const { snapshotReference, writeReferenceLock } = await import('../../src/reference/lock.js');
const { cpPaths } = await import('../../src/paths.js');

const AT = '2026-09-14T00:00:00.000Z';
const TAG = '<CONCEPTPOWERS-REFERENCE-CHANGED>';
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cp-ss-lookups-'));
  await scaffoldInit(root, {});
});

describe('sessionStart: reference lookups', () => {
  it('등록 경로 검증과 참고자료 목록 읽기는 세션 시작마다 한 번씩만 일어난다', async () => {
    const refDir = cpPaths(root).reference;
    await writeFile(join(refDir, 'a.md'), '자료');
    await snapshotReference(root, AT);
    await writeFile(join(refDir, 'a.md'), '자료 — 고침');
    vi.mocked(checkReferencePaths).mockClear();
    vi.mocked(listReferenceFiles).mockClear();

    const o = await buildSessionStartOutput(root, '/plugin');

    expect(o!.hookSpecificOutput.additionalContext).toContain(TAG);
    expect(vi.mocked(checkReferencePaths)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(listReferenceFiles)).toHaveBeenCalledTimes(1);
  });

  it('다른 기기의 홈 절대 경로로 적힌 닿지 않는 등록이면 알림을 올리지 않는다', async () => {
    await writeReferenceLock(root, {
      version: 1,
      at: AT,
      files: { '~/cp-ss-nouser-docs/a.pdf': { hash: 'abc', size: 1, mtime: AT } },
      truncated: [],
    });
    await writeFile(
      join(cpPaths(root).reference, 'paths.md'),
      '- /Users/cp-ss-nouser/cp-ss-nouser-docs\n',
      'utf8'
    );
    const o = await buildSessionStartOutput(root, '/plugin');
    expect(o!.hookSpecificOutput.additionalContext).not.toContain(TAG);
  });
});
