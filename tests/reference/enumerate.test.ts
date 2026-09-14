// @concept:reference-sync @concept:reference-first-duty
// tests/reference/enumerate.test.ts
// 참고자료 목록 만들기(저장소 안 폴더 + 등록된 바깥 위치)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-sync 구성요소 "기준점: 참고자료마다 남긴 지문·크기·시각의 목록"
//    → 저장소 안 파일은 저장소 상대 경로를 열쇠로 삼는다 / 안내용 파일(README·paths.md·.gitignore)은 뺀다
//    → 등록 폴더 안 파일은 "등록 경로/상대 경로"를 열쇠로 삼고, 끝 슬래시가 있어도 같은 열쇠다
//    → 등록한 것이 파일 하나면 등록 경로 그대로가 열쇠다
//  - reference-sync 허용 "이 기기에서 닿지 않는 등록 위치는 삭제가 아니라 닿지 않음으로 보고하는 것"
//    → 없는 등록 경로는 unreachable에 오르고 목록에는 들지 않는다 / 있지만 읽을 수 없는 폴더도 unreachable
//  - reference-first-duty 구성요소 "읽는 곳: 참고자료 폴더 안의 파일과, 경로 목록에 등록된 바깥 위치"
//    → 자료 없는 등록 폴더는 아무것도 내지 않는다 / 상한에 걸린 등록 폴더는 truncated에 오른다
//    → 저장소 안에서도 점 파일·0바이트는 자료가 아니다 / 같은 위치를 두 번 등록해도 열쇠는 하나
//    → 목록 항목은 크기·수정 시각을 함께 싣는다(값싼 견주기의 재료)
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enumerateReference, externalKey, repoKey } from '../../src/reference/enumerate.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { cpPaths } from '../../src/paths.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cp-enum-'));
  await scaffoldInit(root, {});
});

async function registerPaths(lines: string[]): Promise<void> {
  await writeFile(join(cpPaths(root).reference, 'paths.md'), lines.join('\n') + '\n', 'utf8');
}

describe('key helpers', () => {
  it('저장소 안 파일은 docs/conceptpowers/reference/ 아래 상대 경로가 열쇠다', () => {
    expect(repoKey('spec/a.md')).toBe('docs/conceptpowers/reference/spec/a.md');
  });
  it('등록 폴더 열쇠는 끝 슬래시를 떼고 posix로 잇는다', () => {
    expect(externalKey('ext/', 'sub/b.pdf')).toBe('ext/sub/b.pdf');
    expect(externalKey('ext', 'sub\\b.pdf')).toBe('ext/sub/b.pdf');
    expect(externalKey('~/docs/', 'c.md')).toBe('~/docs/c.md');
  });
});

describe('enumerateReference', () => {
  it('저장소 안 파일을 열쇠로 나열하고 안내용 파일은 뺀다', async () => {
    const ref = cpPaths(root).reference;
    await mkdir(join(ref, 'spec'), { recursive: true });
    await writeFile(join(ref, 'spec', 'a.md'), '자료');
    await writeFile(join(ref, 'b.md'), '자료');
    const inv = await enumerateReference(root);
    expect(inv.targets.map((t) => t.key)).toEqual([
      'docs/conceptpowers/reference/b.md',
      'docs/conceptpowers/reference/spec/a.md',
    ]);
    expect(inv.targets.every((t) => t.origin === 'repo')).toBe(true);
    expect(inv.unreachable).toEqual([]);
    expect(inv.truncated).toEqual([]);
  });

  it('등록 폴더의 파일은 "등록 경로/상대 경로"가 열쇠이고 끝 슬래시와 무관하다', async () => {
    await mkdir(join(root, 'ext', 'sub'), { recursive: true });
    await writeFile(join(root, 'ext', 'sub', 'b.pdf'), 'pdf');
    await registerPaths(['- ext/']);
    const withSlash = await enumerateReference(root);
    await registerPaths(['- ext']);
    const without = await enumerateReference(root);
    expect(withSlash.targets.map((t) => t.key)).toEqual(['ext/sub/b.pdf']);
    expect(without.targets.map((t) => t.key)).toEqual(['ext/sub/b.pdf']);
    expect(withSlash.targets[0]).toMatchObject({ origin: 'external', raw: 'ext/' });
  });

  it('등록한 것이 파일 하나면 등록 경로 그대로가 열쇠다', async () => {
    await writeFile(join(root, 'single.md'), '자료');
    await registerPaths(['single.md']);
    const inv = await enumerateReference(root);
    expect(inv.targets.map((t) => t.key)).toEqual(['single.md']);
  });

  it('없는 등록 경로는 unreachable로, 자료 없는 폴더는 조용히 넘어간다', async () => {
    await mkdir(join(root, 'empty'), { recursive: true });
    await registerPaths(['- nope/', '- empty/']);
    const inv = await enumerateReference(root);
    expect(inv.targets).toEqual([]);
    expect(inv.unreachable).toEqual(['nope/']);
  });

  it('있지만 읽을 수 없는 등록 폴더도 unreachable이다(삭제로 보이지 않게)', async () => {
    const locked = join(root, 'locked');
    await mkdir(locked, { recursive: true });
    await writeFile(join(locked, 'x.pdf'), 'pdf');
    await chmod(locked, 0o000);
    try {
      await registerPaths(['- locked/']);
      const inv = await enumerateReference(root);
      expect(inv.targets).toEqual([]);
      expect(inv.unreachable).toEqual(['locked/']);
    } finally {
      await chmod(locked, 0o755);
    }
  });

  it('저장소 안에서도 점 파일·0바이트 파일은 자료로 치지 않는다', async () => {
    const ref = cpPaths(root).reference;
    await mkdir(join(ref, 'sub'), { recursive: true });
    await writeFile(join(ref, '.DS_Store'), 'junk');
    await writeFile(join(ref, 'sub', '.hidden.md'), '숨김');
    await writeFile(join(ref, 'zero.md'), '');
    await writeFile(join(ref, 'a.md'), '자료');
    const inv = await enumerateReference(root);
    expect(inv.targets.map((t) => t.key)).toEqual(['docs/conceptpowers/reference/a.md']);
  });

  it('같은 위치를 두 번 등록해도 열쇠는 한 번만 나온다', async () => {
    await mkdir(join(root, 'ext'), { recursive: true });
    await writeFile(join(root, 'ext', 'x.pdf'), 'pdf');
    await registerPaths(['- ext/', '- ext']);
    const inv = await enumerateReference(root);
    expect(inv.targets.map((t) => t.key)).toEqual(['ext/x.pdf']);
  });

  it('목록 항목에 크기·수정 시각이 실린다', async () => {
    await writeFile(join(cpPaths(root).reference, 'a.md'), '자료');
    const [t] = (await enumerateReference(root)).targets;
    expect(t).toMatchObject({ size: Buffer.byteLength('자료'), mtime: expect.any(String) });
  });

  it('상한에 걸린 등록 폴더는 truncated에 오른다', async () => {
    await mkdir(join(root, 'big'), { recursive: true });
    for (let i = 0; i < 5; i += 1) await writeFile(join(root, 'big', `f${i}.md`), 'x');
    await registerPaths(['- big/']);
    const inv = await enumerateReference(root, { limit: 3 });
    expect(inv.truncated).toEqual(['big/']);
  });
});
