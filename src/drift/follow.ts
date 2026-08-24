// @concept:drift-reconcile
import { stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { isCodeFile } from '../audit/gaps.js';
import { buildMapping } from '../mapping/scan.js';
import { normalizeRel } from './safe.js';

// 따라옴 판정의 단일 잣대 — 커밋 전 문지기(driftGate)와 커밋 뒤 결산(reconcile)이 함께 쓴다.
// 개념과 연결된 코드 가운데 하나라도 목록(present)에 있으면 따라온 것으로 본다.
// 어느 파일을 고쳐야 하는지는 사람만 알 수 있으므로 연결된 코드 전부를 요구하지 않는다.
// 연결된 코드가 없으면 따라올 것이 없으므로 따라옴이다.
export function isFollowed(relatedPaths: readonly string[], present: ReadonlySet<string>): boolean {
  const paths = relatedPaths.map(normalizeRel);
  return paths.length === 0 || paths.some((p) => present.has(p));
}

// 태그는 진실의 원천이고 mapping은 캐시다(concept-code-mapping). 캐시가 낡아 개념의 연결
// 목록에 아직 없는 파일이라도, 첫머리 주석에 @concept:<slug>를 단 채 목록(present)에
// 들어왔다면 그 개념을 따라온 것이다 — 파일에서 직접 스캔해 slug 집합을 만든다.
// 코드 파일만 센다(.md 문서의 헤딩 텍스트가 주석으로 오인되는 것을 막는다 — 태그 정합성
// 스캔 전반과 같은 잣대). ignoreGlobs로 생성물(dist/** 등)의 태그 사본도 세지 않는다.
// 스캔은 커밋될 blob이 아니라 워킹트리 현재 내용을 읽는다 — 문지기와 결산이 같은 기준을
// 쓰므로 잣대는 갈리지 않는다. 실패하면 빈 집합 — 조용히 열리는 대신 물어보는 쪽으로 기운다.
export async function presentTagSlugs(
  root: string,
  present: Iterable<string>,
  ignoreGlobs: string[]
): Promise<ReadonlySet<string>> {
  try {
    const files = [...present].map(normalizeRel).filter(isCodeFile);
    const mapping = await buildMapping(root, files, ignoreGlobs);
    return new Set(Object.keys(mapping));
  } catch {
    return new Set();
  }
}

// 문지기(driftGate)와 결산(reconcile)이 함께 쓰는 확장 잣대(drift-reconcile 불변 규칙:
// 같은 잣대) — 연결 코드가 함께 들어왔거나, 들어온 파일의 첫머리 태그가 이 개념을 가리킨다.
export function isFollowedWithTags(
  d: { slug: string; relatedPaths: readonly string[] },
  present: ReadonlySet<string>,
  taggedSlugs: ReadonlySet<string>
): boolean {
  return isFollowed(d.relatedPaths, present) || taggedSlugs.has(d.slug);
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
