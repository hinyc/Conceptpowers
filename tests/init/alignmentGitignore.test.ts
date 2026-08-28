// @concept:init-gate
// 정렬 기록 폴더의 저장소 제외 설정을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - 상위 기준 문서 "갈아 끼우기 방식"의 구성요소 "대상: 개념·기능 본문과 도구가 관리하는 상태 기록(기준선, 변경
//    이력, 충돌 기록, 검사 증빙, 마지막 커밋 표시)"
//    → .alignment/.gitignore를 만들어 마지막 커밋 표시(last-commit)를 무시 목록에 넣는다
//      (기록 가운데 공유할 것과 각자 것을 가른다)
//  - 상위 기준 문서 "갈아 끼우기 방식"의 불변 "저장 도중 실패하면 … 실패를 감추지 않는다"와 같은 태도로,
//    이미 존재하면 덮어쓰지 않고 false를 반환한다
//  - init-gate 구성요소 "초기화 표시" → init 스캐폴드가 .alignment/.gitignore까지 만들어준다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { ensureAlignmentGitignore } from '../../src/init/alignmentGitignore.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { cpPaths } from '../../src/paths.js';

describe('ensureAlignmentGitignore', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-align-gi-'));
  });

  it('.alignment/.gitignore를 생성하고 last-commit을 무시 목록에 넣는다', async () => {
    const created = await ensureAlignmentGitignore(root);
    expect(created).toBe(true);
    const content = await readFile(join(cpPaths(root).alignmentDir, '.gitignore'), 'utf8');
    expect(content).toContain('last-commit');
  });

  it('이미 존재하면 덮어쓰지 않고 false를 반환한다', async () => {
    const target = join(cpPaths(root).alignmentDir, '.gitignore');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, '# custom\nlast-commit\n', 'utf8');
    const created = await ensureAlignmentGitignore(root);
    expect(created).toBe(false);
    expect(await readFile(target, 'utf8')).toBe('# custom\nlast-commit\n');
  });

  it('init 스캐폴드가 .alignment/.gitignore까지 만들어준다', async () => {
    await scaffoldInit(root, {});
    const content = await readFile(join(cpPaths(root).alignmentDir, '.gitignore'), 'utf8');
    expect(content).toContain('last-commit');
  });
});
