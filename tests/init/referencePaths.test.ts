// @concept:none
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { access } from 'node:fs/promises';
import {
  parseReferencePaths,
  resolveReferencePath,
  checkReferencePaths,
  ensureReferencePaths,
  PATHS_TEMPLATE,
} from '../../src/init/referencePaths.js';
import { cpPaths } from '../../src/paths.js';

describe('parseReferencePaths', () => {
  it('불릿·일반 줄을 경로로 파싱하고 주석·빈 줄·제목은 건너뛴다', () => {
    const md = [
      '# 외부 참고자료 경로',
      '',
      '- /abs/dir/',
      '* /abs/star.md',
      'docs/rel.md',
      '  - indented/path  ',
      '# 주석 줄',
      '',
    ].join('\n');
    expect(parseReferencePaths(md)).toEqual([
      '/abs/dir/',
      '/abs/star.md',
      'docs/rel.md',
      'indented/path',
    ]);
  });
});

describe('ensureReferencePaths', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-ensurepaths-'));
    await mkdir(cpPaths(root).reference, { recursive: true });
  });

  it('없으면 안내 템플릿을 생성하고, 있으면 보존한다(멱등)', async () => {
    expect(await ensureReferencePaths(root)).toBe(true);
    const target = join(cpPaths(root).reference, 'paths.md');
    await expect(access(target)).resolves.toBeUndefined();
    // 재실행: 이미 있으므로 false(덮어쓰지 않음)
    await writeFile(target, '- /my/custom/path\n', 'utf8');
    expect(await ensureReferencePaths(root)).toBe(false);
    expect(await checkReferencePaths(root)).toEqual([
      { raw: '/my/custom/path', resolved: '/my/custom/path', status: 'missing' },
    ]);
  });

  it('템플릿은 전부 주석/빈 줄이라 등록된 경로가 0개다(오경고 방지)', () => {
    expect(parseReferencePaths(PATHS_TEMPLATE)).toEqual([]);
  });
});

describe('resolveReferencePath', () => {
  it('절대·상대·~ 경로를 해석한다', () => {
    expect(resolveReferencePath('/root', '/abs/x')).toBe('/abs/x');
    expect(resolveReferencePath('/root', 'rel/x')).toBe('/root/rel/x');
    expect(resolveReferencePath('/root', '~/x')).toBe(join(homedir(), 'x'));
  });
});

describe('checkReferencePaths', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-refpaths-'));
    await mkdir(cpPaths(root).reference, { recursive: true });
  });

  async function writePathsMd(lines: string[]) {
    await writeFile(join(cpPaths(root).reference, 'paths.md'), lines.join('\n'), 'utf8');
  }

  it('paths.md가 없으면 빈 배열', async () => {
    expect(await checkReferencePaths(root)).toEqual([]);
  });

  it('존재하는 파일·자료 있는 폴더는 ok, 없는 경로는 missing, 빈 폴더는 empty', async () => {
    await mkdir(join(root, 'filled'));
    await writeFile(join(root, 'filled', 'doc.md'), 'x', 'utf8');
    await mkdir(join(root, 'hollow'));
    await writeFile(join(root, 'spec.md'), 'x', 'utf8');
    await writePathsMd(['- spec.md', '- filled', '- hollow', '- no/such/path']);
    const r = await checkReferencePaths(root);
    expect(r.map((e) => [e.raw, e.status])).toEqual([
      ['spec.md', 'ok'],
      ['filled', 'ok'],
      ['hollow', 'empty'],
      ['no/such/path', 'missing'],
    ]);
  });
});
