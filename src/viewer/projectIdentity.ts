// @concept:human-owns-contract
// src/viewer/projectIdentity.ts — 뷰어가 "어느 프로젝트의 것인지" 알리는 식별 정보.
// 같은 폴더는 어떤 경로로 들어와도(심볼릭 링크·macOS /var→/private/var·Windows 드라이브 대소문자)
// 같은 id가 나오도록 실제 경로로 정규화한다. 던지지 않는다.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export interface ProjectIdentity {
  id: string; // 정규화한 프로젝트 경로 sha256 hex 앞 16자
  name: string; // package.json의 name, 없으면 폴더 이름
}

// 뷰어가 쓸 수 있는 포트 범위(앞에서부터 빈 포트를 찾는다).
export const VIEWER_PORT_FIRST = 4173;
export const VIEWER_PORT_LAST = 4192;
export const VIEWER_PORTS: readonly number[] = Object.freeze(
  Array.from({ length: VIEWER_PORT_LAST - VIEWER_PORT_FIRST + 1 }, (_, i) => VIEWER_PORT_FIRST + i)
);

const ID_LENGTH = 16;

function canonicalPath(root: string): string {
  let real: string;
  try {
    real = realpathSync.native(root);
  } catch {
    real = resolve(root);
  }
  // Windows는 드라이브 문자·경로 대소문자 구분이 없으므로 소문자로 맞춘다.
  return process.platform === 'win32' ? real.toLowerCase() : real;
}

function packageName(root: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const name = (parsed as { name?: unknown } | null)?.name;
    return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
  } catch {
    return null;
  }
}

export function readProjectIdentity(root: string): ProjectIdentity {
  const canonical = canonicalPath(root);
  const id = createHash('sha256').update(canonical).digest('hex').slice(0, ID_LENGTH);
  const name = packageName(canonical) ?? (basename(canonical) || canonical);
  return { id, name };
}
