// @concept:concept-code-mapping @concept:audit-gap-detection
// src/mapping/leadingComment.ts
// 파일의 선행 주석 블록(leading comment block)만 잘라낸다.
// @concept 표식은 이 블록 안에서만 표식으로 인정된다 — 본문 속 문자열이나 예시에
// 등장하는 표식 모양 글자는 표식이 아니다.

// 줄 단위 접두사 검사: 공백만 있는 줄, shebang(#!...), 또는 선행 공백 뒤
// //, /*, *, */, #, <!--, --> 로 시작하는 줄. '#'로 시작하는 줄 검사가
// shebang도 함께 포괄한다.
const LEADING_COMMENT_LINE_RE = /^\s*(\/\/|\/\*|\*\/|\*|#|<!--|-->)/;

// /* 로 열려 */ 로 닫히는 블록, 또는 <!-- 로 열려 --> 로 닫히는 블록의 시작을
// 찾는다. 열린 블록 안에서는 별표(*) 접두 없는 줄도 모두 주석으로 간주해야
// 하므로, 줄 단위 접두사 검사와 별개로 "블록이 열려 있는 상태"를 추적한다.
const BLOCK_OPEN_RE = /\/\*|<!--/;

function blockCloseIndex(line: string, opener: '/*' | '<!--'): number {
  const closer = opener === '/*' ? '*/' : '-->';
  return line.indexOf(closer);
}

// 파일 첫 줄부터 순서대로 보면서, 선행 주석 블록에 속하는 줄까지만 이어 붙여
// 돌려준다. 블록 주석( /* … */ 또는 <!-- … --> )이 열린 동안에는 줄 단위
// 접두사와 무관하게 모든 줄을 주석으로 취급한다. 블록이 닫히지 않은 채 파일이
// 끝나면 파일 전체가 선행 블록이다. 블록 밖에서 줄 단위 접두사 조건에 처음으로
// 해당하지 않는 줄(= 첫 코드 줄)을 만나면 거기서 멈춘다.
export function leadingCommentBlock(content: string): string {
  const lines = content.split('\n');
  const kept: string[] = [];
  let openBlock: '/*' | '<!--' | null = null;

  for (const line of lines) {
    if (openBlock) {
      kept.push(line);
      const closeAt = blockCloseIndex(line, openBlock);
      if (closeAt !== -1) openBlock = null;
      continue;
    }

    if (line.trim() === '' || LEADING_COMMENT_LINE_RE.test(line)) {
      kept.push(line);
      const openMatch = line.match(BLOCK_OPEN_RE);
      if (openMatch) {
        const opener = openMatch[0] as '/*' | '<!--';
        const openAt = openMatch.index ?? 0;
        const closeAt = blockCloseIndex(line.slice(openAt), opener);
        if (closeAt === -1) openBlock = opener;
      }
    } else {
      break;
    }
  }
  return kept.join('\n');
}
