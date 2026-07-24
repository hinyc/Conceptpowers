// @concept:none
// src/init/alignmentGitignore.ts
// .alignment/last-commit은 커밋 성공 시마다 훅이 다시 쓰는 로컬 책갈피라
// git이 추적하면 커밋 → dirty → 커밋의 무한 반복이 생긴다. 폴더 전용
// .gitignore로 이 파일만 추적에서 제외한다(history.json·lock은 공유 가치가
// 있어 추적 유지). 사용자 루트 .gitignore는 건드리지 않는다.
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cpPaths } from '../paths.js';

const CONTENT = '# plugin-managed local state (rewritten by hooks on every commit)\nlast-commit\n';

// 생성했으면 true, 이미 있으면(사용자 커스텀 보존) false.
export async function ensureAlignmentGitignore(root: string): Promise<boolean> {
  const target = join(cpPaths(root).alignmentDir, '.gitignore');
  try {
    await access(target);
    return false;
  } catch {
    await mkdir(cpPaths(root).alignmentDir, { recursive: true });
    await writeFile(target, CONTENT, 'utf8');
    return true;
  }
}
