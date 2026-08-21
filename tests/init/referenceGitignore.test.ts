// @concept:reference-privacy @concept:init-gate
// 참고자료 폴더의 저장소 제외 설정을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-privacy 불변 "참고자료 폴더의 파일은 기본적으로 저장소 추적에서 제외하고, 경로 목록만
//    공유한다" → reference/.gitignore를 생성해 전체를 무시하되 paths.md만 추적한다
//  - reference-privacy 불변 "도구가 폴더에 쓸 수 있는 것은 안내용 파일뿐이며, 그것도 아직 없을 때만
//    만든다" → 이미 존재하면 덮어쓰지 않고 false를 반환한다
//  - init-gate 구성요소 "초기화 표시" → init 스캐폴드가 reference/.gitignore까지 만들어준다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { ensureReferenceGitignore } from '../../src/init/referenceGitignore.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { cpPaths } from '../../src/paths.js';

describe('ensureReferenceGitignore', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-ref-gi-'));
  });

  it('reference/.gitignore를 생성 — 전체 무시하되 paths.md만 추적', async () => {
    const created = await ensureReferenceGitignore(root);
    expect(created).toBe(true);
    const content = await readFile(join(cpPaths(root).reference, '.gitignore'), 'utf8');
    expect(content).toContain('*');
    expect(content).toContain('!paths.md');
    expect(content).not.toContain('!README.md');
    expect(content).toContain('!.gitignore');
  });

  it('이미 존재하면 덮어쓰지 않고 false를 반환한다', async () => {
    const target = join(cpPaths(root).reference, '.gitignore');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, '# custom\n', 'utf8');
    const created = await ensureReferenceGitignore(root);
    expect(created).toBe(false);
    expect(await readFile(target, 'utf8')).toBe('# custom\n');
  });

  it('init 스캐폴드가 reference/.gitignore까지 만들어준다', async () => {
    await scaffoldInit(root, {});
    const content = await readFile(join(cpPaths(root).reference, '.gitignore'), 'utf8');
    expect(content).toContain('!paths.md');
  });
});
