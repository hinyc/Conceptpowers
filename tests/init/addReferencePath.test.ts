// @concept:none
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { addReferencePath } from '../../src/init/addReferencePath.js';
import { parseReferencePaths } from '../../src/init/referencePaths.js';
import { cpPaths } from '../../src/paths.js';

describe('addReferencePath', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-addref-'));
    await mkdir(cpPaths(root).reference, { recursive: true });
  });

  const readPathsMd = () => readFile(join(cpPaths(root).reference, 'paths.md'), 'utf8');

  it('paths.md가 없으면 템플릿을 만들고 그 뒤에 경로를 덧붙인다', async () => {
    const r = await addReferencePath(root, ['~/work/specs']);
    expect(r).toEqual({ added: ['~/work/specs'], skipped: [] });
    const content = await readPathsMd();
    expect(content).toContain('# Reference paths');
    expect(parseReferencePaths(content)).toEqual(['~/work/specs']);
  });

  it('기존 내용과 주석을 보존한 채 끝에 덧붙인다', async () => {
    await writeFile(
      join(cpPaths(root).reference, 'paths.md'),
      '# 내 메모\n- docs/first.md\n',
      'utf8'
    );
    await addReferencePath(root, ['docs/second.md']);
    const content = await readPathsMd();
    expect(content).toContain('# 내 메모');
    expect(parseReferencePaths(content)).toEqual(['docs/first.md', 'docs/second.md']);
  });

  it('개행으로 끝나지 않는 파일에도 줄이 섞이지 않게 덧붙인다', async () => {
    await writeFile(join(cpPaths(root).reference, 'paths.md'), '- docs/first.md', 'utf8');
    await addReferencePath(root, ['docs/second.md']);
    expect(parseReferencePaths(await readPathsMd())).toEqual(['docs/first.md', 'docs/second.md']);
  });

  it('감싼 따옴표·불릿·공백을 정규화한다', async () => {
    const r = await addReferencePath(root, ['  "~/My Docs/spec.md"  ', '- docs/rel.md']);
    expect(r.added).toEqual(['~/My Docs/spec.md', 'docs/rel.md']);
    expect(parseReferencePaths(await readPathsMd())).toEqual(['~/My Docs/spec.md', 'docs/rel.md']);
  });

  it('resolve 결과가 같으면 중복으로 건너뛴다(~ 와 절대경로 동일 취급)', async () => {
    await addReferencePath(root, ['~/work/specs']);
    const r = await addReferencePath(root, [join(homedir(), 'work/specs')]);
    expect(r.added).toEqual([]);
    expect(r.skipped).toEqual([{ raw: join(homedir(), 'work/specs'), reason: 'duplicate' }]);
    expect(parseReferencePaths(await readPathsMd())).toEqual(['~/work/specs']);
  });

  it('같은 호출 안의 중복도 한 번만 기록한다', async () => {
    const r = await addReferencePath(root, ['docs/a.md', 'docs/a.md']);
    expect(r.added).toEqual(['docs/a.md']);
    expect(r.skipped).toEqual([{ raw: 'docs/a.md', reason: 'duplicate' }]);
  });

  it('빈 값·주석만 있는 입력은 invalid로 건너뛴다', async () => {
    const r = await addReferencePath(root, ['   ', '# 주석']);
    expect(r.added).toEqual([]);
    expect(r.skipped).toEqual([
      { raw: '   ', reason: 'invalid' },
      { raw: '# 주석', reason: 'invalid' },
    ]);
    expect(parseReferencePaths(await readPathsMd())).toEqual([]);
  });

  it('존재하지 않는 경로도 거부하지 않고 기록한다(경고는 상태로 전달)', async () => {
    const r = await addReferencePath(root, ['no/such/place']);
    expect(r.added).toEqual(['no/such/place']);
    expect(parseReferencePaths(await readPathsMd())).toEqual(['no/such/place']);
  });
});
