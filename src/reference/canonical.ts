// @concept:reference-sync
// src/reference/canonical.ts
// 참고자료 경로를 한 가지 표기로 모은다. 파일 열쇠·옛 기준점 열쇠·개념 근거 경로가 모두 이 함수를 거쳐야
// 같은 파일이 표기 차이로 "추가+삭제"나 "영향 없음"으로 어긋나지 않는다.
//  - 저장소 안 → 저장소 상대(저장소가 홈 아래일 수 있으므로 저장소를 먼저 본다)
//  - 홈 아래 → ~/… (기기마다 홈이 달라도 같은 열쇠)
//  - 그 밖 → 절대 경로
// 표기 정리: 역슬래시 → 슬래시, 드라이브 문자 소문자, ./ ../ // 정리, 끝 슬래시 제거, 유니코드 NFC.
// 심볼릭 링크는 경로마다 풀지 않는다 — 한쪽에서만 풀면 어긋나므로, 저장소·홈의 다른 이름은 별칭으로만 흡수한다.
import { realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { posix } from 'node:path';

/** 저장소 루트와 홈의 여러 이름(정리된 표기). loadAliases가 만든다. */
export interface PathAliases {
  roots: string[];
  homes: string[];
}

const DRIVE = /^([A-Za-z]):/;
const ABSOLUTE = /^(?:[A-Za-z]:)?\//;
// 다른 기기의 개인 홈처럼 보이는 절대 경로 — /Users/<name>, /home/<name>, C:/Users/<name>.
// 공용 폴더(/Users/Shared, C:/Users/Public)는 개인 홈이 아니다.
const HOME_LIKE = /^(?:[a-z]:)?\/(?:users|home)\/(?!(?:shared|public)(?:\/|$))[^/]+(?=\/|$)/i;
// macOS는 /var·/tmp·/etc가 /private 아래를 가리키는 링크다 — 두 이름을 같은 위치로 본다.
const PRIVATE_PREFIX = '/private/';

export function cleanPath(p: string): string {
  const unified = p
    .replace(/\\/g, '/')
    .normalize('NFC')
    .replace(DRIVE, (_m, d: string) => `${d.toLowerCase()}:`);
  const trimmed = posix.normalize(unified).replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export function isAbsoluteKey(p: string): boolean {
  return ABSOLUTE.test(p.replace(/\\/g, '/'));
}

function isUnder(p: string, base: string): boolean {
  if (base === '/') return p.startsWith('/');
  return p === base || p.startsWith(`${base}/`);
}

function rest(p: string, base: string): string {
  if (p === base) return '';
  return base === '/' ? p.slice(1) : p.slice(base.length + 1);
}

/** 절대 경로 하나를 정규 표기로 바꾼다. aliases는 정리된 표기여야 한다(loadAliases). */
export function canonicalPath(abs: string, aliases: PathAliases): string {
  const p = cleanPath(abs);
  for (const root of aliases.roots) {
    if (isUnder(p, root)) return rest(p, root) || '.';
  }
  for (const home of aliases.homes) {
    if (isUnder(p, home)) return rest(p, home) ? `~/${rest(p, home)}` : '~';
  }
  return p;
}

/** 이미 적혀 있는 표기(저장소 상대·~/…·절대·./·../)를 절대 경로로 풀었다가 정규 표기로 되돌린다. */
export function canonicalKeyOf(root: string, key: string, aliases: PathAliases): string {
  const k = key.replace(/\\/g, '/');
  const home = aliases.homes[0];
  const homeForm = k === '~' || k.startsWith('~/');
  if (homeForm && !home) return cleanPath(k);
  const abs = homeForm ? `${home}/${k.slice(2)}` : isAbsoluteKey(k) ? k : `${root}/${k}`;
  return canonicalPath(abs, aliases);
}

/** 다른 기기의 개인 홈처럼 보이는 절대 경로를 기기와 무관한 ~/… 로 바꾼다. 아니면 null. */
export function portableHomeForm(p: string): string | null {
  const c = cleanPath(p);
  const m = c.match(HOME_LIKE);
  if (!m) return null;
  const tail = c.slice(m[0].length);
  return tail === '' ? '~' : `~${tail}`;
}

export async function safeRealpath(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch {
    return p;
  }
}

// 정리한 이름과, /private 앞부분을 뗀 이름(macOS 시스템 링크)을 함께 낸다.
function nameForms(p: string): string[] {
  const c = cleanPath(p);
  return c.startsWith(PRIVATE_PREFIX) ? [c, c.slice(PRIVATE_PREFIX.length - 1)] : [c];
}

export async function loadAliases(root: string, home: string = homedir()): Promise<PathAliases> {
  const [realRoot, realHome] = await Promise.all([safeRealpath(root), safeRealpath(home)]);
  // 한 번만 정리해 둔다 — canonicalPath는 이 표기를 그대로 쓴다.
  return {
    roots: [...new Set([root, realRoot].flatMap(nameForms))],
    homes: [...new Set([home, realHome].flatMap(nameForms))],
  };
}
