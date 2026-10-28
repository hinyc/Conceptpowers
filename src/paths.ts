// @concept:none
import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const CP_REL = 'docs/conceptpowers';
/** 참고자료 폴더(저장소 기준 상대경로) — 커밋 문지기의 참고자료 판정이 모두 이 값을 쓴다 */
export const REFERENCE_REL = `${CP_REL}/reference`;

// 경로의 실제 위치: 있는 조상까지 바로가기를 풀고 나머지를 붙인다(아직 없는 파일을 가리킬 때도 쓴다).
export function canonicalPath(path: string): string {
  let current = resolve(path);
  let tail: string[] = [];
  for (;;) {
    try {
      return join(realpathSync(current), ...tail);
    } catch {
      const parent = dirname(current);
      if (parent === current) return resolve(path);
      tail = [basename(current), ...tail];
      current = parent;
    }
  }
}

/** 대소문자를 구분하지 않는 파일시스템(macOS·Windows 기본값) — 대소문자만 다른 표기도 같은 파일이다 */
export const CASE_INSENSITIVE_FS = process.platform === 'darwin' || process.platform === 'win32';
/** 대소문자 무시 파일시스템이면 소문자로 접는다 — 경로를 견줄 때 쓴다 */
export const foldCase = (text: string): string => (CASE_INSENSITIVE_FS ? text.toLowerCase() : text);

// 절대경로의 저장소 루트 기준 상대경로('/' 구분, 루트 자신은 ''). 루트 밖이면 null. 바로가기를 풀고, 대소문자 무시
// 파일시스템이면 대소문자만 다른 표기도 루트 안으로 본다(돌려주는 경로는 받은 표기 그대로). 바로가기를 풀기 전·후
// 어느 쪽으로든 루트 안이면 루트 안이다.
export function repoRelative(root: string, abs: string): string | null {
  for (const base of [resolve(root), canonicalPath(root)]) {
    for (const target of [resolve(abs), canonicalPath(abs)]) {
      const rel = innerRelative(base, target);
      if (rel !== null) return rel;
    }
  }
  return null;
}

/**
 * 절대경로의 루트 기준 상대경로('/' 구분, 루트 자신은 ''). 루트 안이면 repoRelative와 같고, 루트 밖이면 바로가기를 푼
 * 실제 위치끼리 견줘 `../`로 나간다(같은 저장소의 형제 폴더 경로를 루트에서 친 것처럼 넘길 때 쓴다).
 */
export function rootRelative(root: string, abs: string): string {
  const inner = repoRelative(root, abs);
  if (inner !== null) return inner;
  return relative(canonicalPath(root), canonicalPath(abs)).split(sep).join('/');
}

function innerRelative(base: string, target: string): string | null {
  const rel = relative(foldCase(base), foldCase(target));
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  if (rel === '') return '';
  // 접은 글자 길이가 같으면 받은 표기를 살린다(드문 비ASCII 길이 변화는 접은 표기로).
  const sameLength = target.length === base.length + rel.length + 1;
  return (sameLength ? target.slice(target.length - rel.length) : rel).split(sep).join('/');
}

export function cpPaths(root: string) {
  const base = join(root, CP_REL);
  return {
    base,
    initFile: join(base, 'init.json'),
    features: join(base, 'features'),
    reference: join(base, 'reference'),
    conceptsData: join(base, 'concepts', 'data'),
    conceptsViewer: join(base, 'concepts', 'viewer'),
    architecture: join(base, 'architecture'),
    infra: join(base, 'infra'),
    mappingCache: join(base, '.cache', 'mapping.json'),
    cssTarget: join(base, 'concepts', 'viewer', 'assets', 'concept.css'),
    alignmentDir: join(base, 'concepts', '.alignment'),
    alignmentLock: join(base, 'concepts', '.alignment', 'alignment.lock.json'),
    // 예전 한 파일 이력(읽기 전용) — 새 기록은 alignmentHistoryDir에 기록마다 파일로 더한다.
    alignmentHistory: join(base, 'concepts', '.alignment', 'history.json'),
    alignmentHistoryDir: join(base, 'concepts', '.alignment', 'history'),
    alignmentLastCommit: join(base, 'concepts', '.alignment', 'last-commit'),
    pendingConflicts: join(base, 'concepts', '.alignment', 'pending-conflicts.json'),
    attestFile: join(base, 'concepts', '.alignment', 'attest.json'),
    testReviewFile: join(base, 'concepts', '.alignment', 'test-review.json'),
    noCodeFile: join(base, 'concepts', '.alignment', 'no-code.json'),
    referenceLock: join(base, 'concepts', '.alignment', 'reference.lock.json'),
  } as const;
}
