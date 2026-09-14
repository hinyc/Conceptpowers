// @concept:reference-sync @concept:reference-privacy
// tests/init/referenceLockIgnore.test.ts
// 참고자료 기준점을 저장소에 올릴지(shared)/내 컴퓨터에만 둘지(local)에 따라 .alignment/.gitignore를
// 맞추는 것을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-privacy 허용 "프로젝트 설정으로 공유를 택했을 때만 참고자료 기준점을 저장소에 함께 올리는 것"
//    → local이면 제외 줄을 넣는다 / shared면 제외 줄을 뺀다 / 기본 설정(shared)에서는 제외 줄이 없다
//  - reference-privacy 불변 "도구가 폴더에 쓸 수 있는 것은 안내용 파일뿐이며, 그것도 아직 없을 때만 만든다"
//    → 사람이 적어 둔 다른 줄은 그대로 두고, 바뀐 것이 없으면 파일을 다시 쓰지 않는다(unchanged)
//  - reference-sync 구성요소 "기준점: 참고자료마다 남긴 지문·크기·시각의 목록"
//    → 기준점을 찍으면 설정에 맞춰 .gitignore가 함께 맞춰진다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyReferenceLockIgnore } from '../../src/init/referenceLockIgnore.js';
import { snapshotReference } from '../../src/reference/lock.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { cpPaths } from '../../src/paths.js';

let root: string;
let target: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cp-rlock-gi-'));
  await scaffoldInit(root, {});
  target = join(cpPaths(root).alignmentDir, '.gitignore');
});

async function lines(): Promise<string[]> {
  return (await readFile(target, 'utf8')).replace(/\n$/, '').split('\n');
}

describe('applyReferenceLockIgnore', () => {
  it('local이면 제외 줄을 넣고, shared면 뺀다', async () => {
    expect(await applyReferenceLockIgnore(root, 'local')).toBe('added');
    expect(await lines()).toContain('reference.lock.json');
    expect(await applyReferenceLockIgnore(root, 'shared')).toBe('removed');
    expect(await lines()).not.toContain('reference.lock.json');
  });

  it('바뀐 것이 없으면 unchanged이고 사람이 적어 둔 줄은 그대로다', async () => {
    await mkdir(cpPaths(root).alignmentDir, { recursive: true });
    await writeFile(target, '# custom\nlast-commit\nmy-note.txt\n', 'utf8');
    expect(await applyReferenceLockIgnore(root, 'shared')).toBe('unchanged');
    expect(await readFile(target, 'utf8')).toBe('# custom\nlast-commit\nmy-note.txt\n');
    expect(await applyReferenceLockIgnore(root, 'local')).toBe('added');
    expect(await lines()).toEqual([
      '# custom',
      'last-commit',
      'my-note.txt',
      'reference.lock.json',
    ]);
    expect(await applyReferenceLockIgnore(root, 'local')).toBe('unchanged');
  });

  it('.gitignore가 없으면 만들고 나서 맞춘다', async () => {
    expect(await applyReferenceLockIgnore(root, 'local')).toBe('added');
    expect(await lines()).toContain('last-commit');
  });
});

describe('snapshotReference와 설정', () => {
  it('기본 설정(shared)에서는 기준점을 찍어도 제외 줄이 없다', async () => {
    await writeFile(join(cpPaths(root).reference, 'a.md'), '자료');
    const r = await snapshotReference(root, '2026-09-14T00:00:00.000Z');
    expect(r.mode).toBe('shared');
    expect(await lines()).not.toContain('reference.lock.json');
  });

  it('설정이 local이면 기준점을 찍을 때 제외 줄이 들어간다', async () => {
    const initFile = cpPaths(root).initFile;
    const cfg = JSON.parse(await readFile(initFile, 'utf8'));
    await writeFile(initFile, JSON.stringify({ ...cfg, referenceLock: 'local' }, null, 2));
    await writeFile(join(cpPaths(root).reference, 'a.md'), '자료');
    const r = await snapshotReference(root, '2026-09-14T00:00:00.000Z');
    expect(r.mode).toBe('local');
    expect(await lines()).toContain('reference.lock.json');
  });
});
