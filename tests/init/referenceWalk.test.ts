// @concept:reference-first-duty @concept:reference-privacy
// tests/init/referenceWalk.test.ts
// 참고자료 폴더 트리를 훑는 공용 walker를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-first-duty 구성요소 "읽는 곳: 참고자료 폴더 안의 파일과, 경로 목록에 등록된 바깥 위치"
//    → 하위 폴더까지 재귀해 자료 파일을 방문한다 / 점(.) 이름과 0바이트 파일은 자료로 치지 않는다
//    → 방문자가 false를 돌려주면 즉시 멈춘다(stopped) / 상한을 넘으면 capped
//    → 시작 폴더 자체를 못 읽으면 unreadable(빈 것과 구별) / 방문자에게 크기·시각을 넘긴다(재stat 방지)
//  - reference-privacy 불변 "도구는 사람이 넣은 참고자료를 읽기만 하고 그 내용을 고치지 않는다"
//    → 훑기만 하고 파일을 만들거나 고치지 않는다(방문 뒤 목록이 그대로다)
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkUsableFiles, fileHasBytes } from '../../src/init/referenceWalk.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cp-walk-'));
});

describe('walkUsableFiles', () => {
  it('하위 폴더까지 재귀해 자료 파일을 방문하고, 점 이름·0바이트 파일은 건너뛴다', async () => {
    await mkdir(join(dir, 'sub', 'deep'), { recursive: true });
    await mkdir(join(dir, '.hidden'), { recursive: true });
    await writeFile(join(dir, 'a.md'), '자료');
    await writeFile(join(dir, 'sub', 'deep', 'b.pdf'), 'pdf');
    await writeFile(join(dir, 'empty.txt'), '');
    await writeFile(join(dir, '.DS_Store'), 'junk');
    await writeFile(join(dir, '.hidden', 'c.md'), '숨김');
    const seen: string[] = [];
    const outcome = await walkUsableFiles(dir, (abs) => {
      seen.push(abs);
      return true;
    });
    expect(outcome).toBe('done');
    expect(seen.sort()).toEqual([join(dir, 'a.md'), join(dir, 'sub', 'deep', 'b.pdf')]);
  });

  it('방문자가 false를 돌려주면 즉시 멈춘다(stopped)', async () => {
    await writeFile(join(dir, 'a.md'), '1');
    await writeFile(join(dir, 'b.md'), '2');
    let count = 0;
    const outcome = await walkUsableFiles(dir, () => {
      count += 1;
      return false;
    });
    expect(outcome).toBe('stopped');
    expect(count).toBe(1);
  });

  it('상한을 넘으면 capped로 끝난다', async () => {
    for (let i = 0; i < 5; i += 1) await writeFile(join(dir, `f${i}.md`), 'x');
    const outcome = await walkUsableFiles(dir, () => true, 3);
    expect(outcome).toBe('capped');
  });

  it('방문자에게 크기·수정 시각을 함께 넘긴다', async () => {
    await writeFile(join(dir, 'a.md'), '자료');
    const got: { size: number; mtime: string }[] = [];
    await walkUsableFiles(dir, (_abs, s) => {
      got.push(s);
      return true;
    });
    expect(got).toEqual([{ size: Buffer.byteLength('자료'), mtime: expect.any(String) }]);
  });

  it('시작 폴더 자체를 읽지 못하면 unreadable — 안이 비었다는 뜻이 아니다', async () => {
    expect(await walkUsableFiles(join(dir, 'nope'), () => true)).toBe('unreadable');
  });

  it('훑기만 하고 폴더 내용을 바꾸지 않는다', async () => {
    await writeFile(join(dir, 'a.md'), '자료');
    const before = (await readdir(dir)).sort();
    await walkUsableFiles(dir, () => true);
    expect((await readdir(dir)).sort()).toEqual(before);
  });
});

describe('fileHasBytes', () => {
  it('0바이트나 없는 파일은 false, 내용 있는 파일은 true', async () => {
    await writeFile(join(dir, 'empty'), '');
    await writeFile(join(dir, 'full'), 'x');
    expect(await fileHasBytes(join(dir, 'empty'))).toBe(false);
    expect(await fileHasBytes(join(dir, 'missing'))).toBe(false);
    expect(await fileHasBytes(join(dir, 'full'))).toBe(true);
  });
});
