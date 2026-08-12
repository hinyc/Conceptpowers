// @concept:audit-gap-detection
// src/audit/tracked.ts
// 전체 스캔용: git이 추적하는 파일 전체 목록. git 저장소가 아니면 throw
// (전체 스캔은 git 없이는 성립하지 않으므로 CLI 최상위 catch가 error로 변환).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// 대형 저장소에서도 안전하도록 execFile 기본 1MB maxBuffer를 넉넉히 늘린다.
const MAX_BUFFER = 64 * 1024 * 1024;

export async function listTrackedFiles(root: string): Promise<string[]> {
  // core.quotePath=false + -z: git이 비-ASCII 경로(예: src/한글.ts)를 따옴표로
  // 감싸 사람이 읽기 좋게 바꾸지 않고 NUL로 구분된 원본 그대로 내보내게 한다.
  const { stdout } = await execFileAsync(
    'git',
    ['-c', 'core.quotePath=false', 'ls-files', '-z'],
    { cwd: root, maxBuffer: MAX_BUFFER }
  );
  return stdout
    .split('\0')
    .map((l) => l.trim())
    .filter(Boolean);
}
