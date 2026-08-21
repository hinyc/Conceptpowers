// @concept:reference-privacy @concept:reference-first-duty
// 바깥 참고자료 경로 목록(paths.md)의 파싱·해석·현황 판정을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-first-duty 구성요소 "읽는 곳: 참고자료 폴더 안의 파일과, 경로 목록에 등록된 바깥 위치"
//    → 불릿·일반 줄을 경로로 파싱하고 주석·빈 줄·제목은 건너뛴다 / 절대·상대·~ 경로를 해석한다
//    → 존재하는 파일·자료 있는 폴더는 ok, 없는 경로는 missing, 빈 폴더는 empty
//    → 하위 폴더의 자료도 찾아 ok / 빈 하위 폴더·숨김 파일만·0바이트만 있는 폴더는 empty
//      (읽을 자료가 실제로 있는지를 가른다)
//  - reference-privacy 불변 "참고자료 폴더의 파일은 기본적으로 저장소 추적에서 제외하고, 경로 목록만
//    공유한다" → paths.md가 없으면 빈 배열 (자료가 아니라 목록만이 공유 대상이다)
//  - reference-privacy 불변 "도구가 폴더에 쓸 수 있는 것은 안내용 파일뿐이며, 그것도 아직 없을 때만
//    만든다" → 없으면 안내 템플릿을 만들고 있으면 보존한다(멱등)
//    → 템플릿은 전부 주석·빈 줄이라 등록된 경로가 0개다(오경고 방지)
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

  it('하위 폴더에 있는 자료도 찾아 ok로 판정한다', async () => {
    await mkdir(join(root, 'nested', 'deep'), { recursive: true });
    await writeFile(join(root, 'nested', 'deep', 'doc.md'), 'x', 'utf8');
    await writePathsMd(['- nested']);
    expect((await checkReferencePaths(root))[0].status).toBe('ok');
  });

  it('빈 하위 폴더만 있는 폴더는 empty', async () => {
    await mkdir(join(root, 'shell', 'inner'), { recursive: true });
    await writePathsMd(['- shell']);
    expect((await checkReferencePaths(root))[0].status).toBe('empty');
  });

  it('점(.)으로 시작하는 파일만 있는 폴더는 empty', async () => {
    await mkdir(join(root, 'dotonly'));
    await writeFile(join(root, 'dotonly', '.DS_Store'), 'x', 'utf8');
    await writePathsMd(['- dotonly']);
    expect((await checkReferencePaths(root))[0].status).toBe('empty');
  });

  it('0바이트 파일만 있는 폴더와 0바이트 단일 파일은 empty', async () => {
    await mkdir(join(root, 'zeros'));
    await writeFile(join(root, 'zeros', 'blank.md'), '', 'utf8');
    await writeFile(join(root, 'blank.md'), '', 'utf8');
    await writePathsMd(['- zeros', '- blank.md']);
    expect((await checkReferencePaths(root)).map((e) => e.status)).toEqual(['empty', 'empty']);
  });
});
