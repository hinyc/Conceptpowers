// @concept:concept-code-mapping @concept:audit-gap-detection
// src/mapping/leadingComment.ts
// 파일의 선행 주석 블록(leading comment block)만 잘라낸다.
// @concept 표식은 이 블록 안에서만 표식으로 인정된다 — 본문 속 문자열이나 예시에
// 등장하는 표식 모양 글자는 표식이 아니다.

// 공백만 있는 줄, shebang(#!...), 또는 선행 공백 뒤 //, /*, *, */, #, <!--, -->
// 로 시작하는 줄까지만 "선행 주석 블록"으로 인정한다. '#'로 시작하는 줄 검사가
// shebang도 함께 포괄한다.
const LEADING_COMMENT_LINE_RE = /^\s*(\/\/|\/\*|\*\/|\*|#|<!--|-->)/;

// 파일 첫 줄부터 순서대로 보면서, 위 조건에 해당하는 줄까지만 이어 붙여 돌려준다.
// 조건에 처음으로 해당하지 않는 줄(= 첫 코드 줄)을 만나면 거기서 멈춘다.
export function leadingCommentBlock(content: string): string {
  const lines = content.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    if (line.trim() === '' || LEADING_COMMENT_LINE_RE.test(line)) {
      kept.push(line);
    } else {
      break;
    }
  }
  return kept.join('\n');
}
