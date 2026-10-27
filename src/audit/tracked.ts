// @concept:concept-code-mapping
// src/audit/tracked.ts
// 전체 스캔용: git이 추적하는 파일 전체 목록. git 저장소가 아니면 throw
// (전체 스캔은 git 없이는 성립하지 않으므로 CLI 최상위 catch가 error로 변환).
import { git } from '../util/git.js';

export async function listTrackedFiles(root: string): Promise<string[]> {
  // 공용 래퍼(core.quotePath=false·넉넉한 출력 상한) + -z: git이 비-ASCII 경로(예: src/한글.ts)를
  // 따옴표로 감싸 사람이 읽기 좋게 바꾸지 않고 NUL로 구분된 원본 그대로 내보내게 한다.
  const stdout = await git(root, ['ls-files', '-z']);
  return stdout
    .split('\0')
    .map((l) => l.trim())
    .filter(Boolean);
}
