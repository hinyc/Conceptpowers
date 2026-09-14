// @concept:reference-sync @concept:reference-privacy
// src/reference/fingerprint.ts
// 참고자료 파일의 지문을 계산한다. 참고자료 파일을 여는 곳은 이 모듈뿐이며, 읽은 바이트는
// 해시로만 소비되고 밖으로 나가지 않는다 — 기준점에는 내용이 아니라 지문·크기·시각만 남는다.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { ReferenceLockEntry } from '../schema/alignment.js';

export interface FileStat {
  size: number;
  mtime: string;
}

// 없거나 파일이 아니면 null.
export async function statFile(abs: string): Promise<FileStat | null> {
  try {
    const s = await stat(abs);
    if (!s.isFile()) return null;
    return { size: s.size, mtime: s.mtime.toISOString() };
  } catch {
    return null;
  }
}

// 스트림으로 읽어 큰 PDF도 메모리에 통째로 올리지 않는다. 계약 지문과 같은 길이로 자른다
// (48비트 — 변경 감지에는 충분하고, 기준점 파일을 짧게 유지한다).
export async function hashFile(abs: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(abs)) hash.update(chunk as Buffer);
  return hash.digest('hex').slice(0, 12);
}

export async function fingerprintFile(abs: string): Promise<ReferenceLockEntry | null> {
  const s = await statFile(abs);
  if (!s) return null;
  try {
    return { hash: await hashFile(abs), size: s.size, mtime: s.mtime };
  } catch {
    return null; // stat 뒤 사라졌거나 읽을 수 없는 파일 — 호출한 쪽이 건너뛴 개수로 알린다
  }
}
