// @concept:drift-reconcile
import { stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { normalizeRel } from './safe.js';

// 따라옴 판정의 단일 잣대 — 커밋 전 문지기(driftGate)와 커밋 뒤 결산(reconcile)이 함께 쓴다.
// 개념과 연결된 코드 가운데 하나라도 목록(present)에 있으면 따라온 것으로 본다.
// 어느 파일을 고쳐야 하는지는 사람만 알 수 있으므로 연결된 코드 전부를 요구하지 않는다.
// 연결된 코드가 없으면 따라올 것이 없으므로 따라옴이다.
export function isFollowed(relatedPaths: readonly string[], present: ReadonlySet<string>): boolean {
  const paths = relatedPaths.map(normalizeRel);
  return paths.length === 0 || paths.some((p) => present.has(p));
}

// 목록(present)에 들어오지 않은 연결 코드 — 안내문에 쓴다.
export function missingRelatedPaths(
  relatedPaths: readonly string[],
  present: ReadonlySet<string>
): string[] {
  return relatedPaths.map(normalizeRel).filter((p) => !present.has(p));
}

// 루트 안의 상대 경로만 판정 대상이다 — 루트 밖('..')이나 절대 경로는 git 목록에 나올 수 없다.
function isInsideRoot(root: string, rel: string): boolean {
  const r = relative(resolve(root), resolve(root, rel));
  return r !== '' && !r.startsWith('..') && !isAbsolute(r);
}

// 판정 대상이 되는 "실제 파일"인지 확인한다. 없는 파일(ENOENT/ENOTDIR)·디렉터리·루트 밖은
// 대상이 아니다. 그 밖의 오류(권한 등)는 보수적으로 '있음'으로 본다 — 게이트를 조용히 여는
// 쪽(fail-open)으로 기울지 않기 위해서다. 그 결과 그런 경로는 커밋에 들어올 수 없으므로
// 결산에서 ignored로 기록될 수 있다(원인 추적 시 참고).
// 주의: 대소문자 무시 파일시스템(macOS/Windows)에서는 표기가 다른 경로도 '있음'이 될 수 있다.
export async function isRelatedFile(root: string, rel: string): Promise<boolean> {
  if (!isInsideRoot(root, rel)) return false;
  try {
    return (await stat(join(root, rel))).isFile();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return !(code === 'ENOENT' || code === 'ENOTDIR');
  }
}

// 이제 존재하지 않는 파일 경로는 연결된 코드에서 뺀다 — 삭제·이동된 경로가 판정을
// 영구히 막지 않게 한다. 정규화한 경로를 돌려준다.
export async function pruneMissingPaths(
  root: string,
  relatedPaths: readonly string[]
): Promise<string[]> {
  const paths = relatedPaths.map(normalizeRel);
  const checks = await Promise.all(paths.map((p) => isRelatedFile(root, p)));
  return paths.filter((_, i) => checks[i]);
}
