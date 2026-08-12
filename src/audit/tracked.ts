// @concept:audit-gap-detection
// src/audit/tracked.ts
// 전체 스캔용: git이 추적하는 파일 전체 목록. git 저장소가 아니면 throw
// (전체 스캔은 git 없이는 성립하지 않으므로 CLI 최상위 catch가 error로 변환).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function listTrackedFiles(root: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['ls-files'], { cwd: root });
  return stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}
