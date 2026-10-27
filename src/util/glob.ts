// @concept:concept-code-mapping
// src/util/glob.ts
// 의존성 없는 미니 글롭 매처. `**`(슬래시 포함 임의 경로)와 `*`(단일 세그먼트)만 지원한다.
// init.json의 ignoreGlobs로 거버넌스 제외 경로를 판정하는 용도.
import { normalizeRel } from '../drift/safe.js';

const REGEX_SPECIAL = '\\^$.|?+()[]{}';

// 단일 글롭을 앵커된 RegExp로 변환한다(불변·순수).
function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          re += '(?:.*/)?'; // `**/` 는 0개 이상 디렉터리(세그먼트 경계 유지)
          i++;
        } else {
          re += '.*'; // 경로 중간/끝의 bare `**`
        }
      } else {
        re += '[^/]*';
      }
    } else if (REGEX_SPECIAL.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

// 사람이 적은 글롭을 경로와 같은 모양으로 맞춘다(./ · 백슬래시 제거). 끝 슬래시나 와일드카드 없는
// 이름은 폴더로 보고 그 아래 전부를 덧붙인다 — 이름 그대로의 파일도 함께 매칭한다.
function normalizeGlob(glob: string): string[] {
  const raw = normalizeRel(glob.trim());
  const g = raw.replace(/\/+$/, '');
  if (!g) return [];
  if (g !== raw) return [`${g}/**`];
  return g.includes('*') ? [g] : [g, `${g}/**`];
}

// 경로가 글롭 목록 중 하나라도 매칭되면 true.
export function matchesAny(path: string, globs: string[]): boolean {
  const p = normalizeRel(path);
  return globs.flatMap(normalizeGlob).some((g) => globToRegExp(g).test(p));
}
