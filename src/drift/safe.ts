// drift 경로 비교와 LLM 컨텍스트 주입을 위한 안전 유틸.

// git이 내놓는 경로(repo-root 상대, POSIX)와 feature codePaths/태그 경로의
// 표기 차이를 흡수한다: 백슬래시→슬래시, 선행 './' 제거, 중복/선행 슬래시 정리.
export function normalizeRel(p: string): string {
  return p
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+/, '');
}

// 제거 대상 코드포인트를 코드로 판정한다(소스에 비인쇄 문자를 넣지 않기 위함).
//  - C0/DEL/C1 제어문자: 0x00-0x1f, 0x7f-0x9f  → 공백으로 치환
//  - bidi/zero-width/line-separator(시각적 위조·숨김)            → 제거
//  - 각괄호/대괄호(<CONCEPT-DRIFT>·[..] 같은 블록 구분자 위조)   → 제거
function isControl(c: number): boolean {
  return c <= 0x1f || (c >= 0x7f && c <= 0x9f);
}
function isInvisible(c: number): boolean {
  return (
    (c >= 0x200b && c <= 0x200f) ||
    c === 0x2028 ||
    c === 0x2029 ||
    c === 0x0085 ||
    (c >= 0x202a && c <= 0x202e) ||
    (c >= 0x2066 && c <= 0x2069) ||
    c === 0xfeff
  );
}
function isBracket(ch: string): boolean {
  return ch === '<' || ch === '>' || ch === '[' || ch === ']';
}

// 비신뢰 문자열(reason, 경로 등)을 LLM 컨텍스트에 넣기 전 무력화한다.
// 자연어 지시 주입을 완전히 막을 수는 없으므로(호출 측에서 따옴표+비신뢰 라벨로
// 구조 분리), 여기서는 구조 위조에 쓰이는 문자만 제거/축약한다.
export function sanitizeText(s: string, max = 200): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (isControl(c)) {
      out += ' ';
      continue;
    }
    if (isInvisible(c) || isBracket(ch)) continue;
    out += ch;
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, max);
}
