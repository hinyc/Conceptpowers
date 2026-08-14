// @concept:concept-code-mapping @concept:audit-gap-detection
// src/mapping/leadingComment.ts
// 파일의 선행 주석 블록(leading comment block)만 잘라낸다.
// @concept 표식은 이 블록 안에서만 표식으로 인정된다 — 본문 속 문자열이나 예시에
// 등장하는 표식 모양 글자는 표식이 아니다.

// 줄(또는 블록 닫힘 뒤 나머지) 접두사 검사: 공백만, shebang(#!...), 또는 선행
// 공백 뒤 //, /*, *, */, #, <!--, --> 로 시작하면 주석류로 인정한다. '#'로
// 시작하는 줄 검사가 shebang도 함께 포괄한다.
const LEADING_COMMENT_LINE_RE = /^\s*(\/\/|\/\*|\*\/|\*|#|<!--|-->)/;
// 블록을 "여는" 토큰만 판별한다 (닫는 토큰 */, --> 는 제외) — 여는 토큰을
// 만나면 같은 줄 안에서 짝이 되는 닫는 토큰을 계속 찾아야 하기 때문이다.
const BLOCK_OPENER_RE = /^\s*(\/\*|<!--)/;

type Opener = '/*' | '<!--';
const CLOSER: Record<Opener, string> = { '/*': '*/', '<!--': '-->' };

// 파일 첫 줄부터 순서대로 보면서, 선행 주석 블록에 속하는 부분까지만 이어
// 붙여 돌려준다.
//
// 블록 주석( /* … */ 또는 <!-- … --> )이 열린 동안에는 줄 단위 접두사와
// 무관하게 닫는 토큰을 만날 때까지 모두 주석으로 취급한다. 블록이 같은 줄
// 안에서 닫히면, 그 지점 **이후**의 나머지(코드일 수도, 또 다른 주석일
// 수도 있다)를 별도로 재판정한다 — 나머지가 코드면 거기서 전체 스캔을
// 멈추고, 그 지점 이후 내용(뒤따르는 표식 포함)은 선행 블록에 포함하지
// 않는다. 블록이 닫히지 않은 채 파일이 끝나면 파일 전체가 선행 블록이다.
export function leadingCommentBlock(content: string): string {
  const lines = content.split('\n');
  const kept: string[] = [];
  let openBlock: Opener | null = null;

  outer: for (const line of lines) {
    let pos = 0;
    let lineBuf = '';

    for (;;) {
      if (openBlock) {
        const closeAt = line.indexOf(CLOSER[openBlock], pos);
        if (closeAt === -1) {
          lineBuf += line.slice(pos);
          break; // 이 줄은 끝까지 주석 — 다음 줄에서도 openBlock 유지
        }
        const closeEnd = closeAt + CLOSER[openBlock].length;
        lineBuf += line.slice(pos, closeEnd); // 닫는 토큰까지만 포함
        pos = closeEnd;
        openBlock = null;
        continue; // 같은 줄에 이어지는 나머지를 다시 판정
      }

      const rest = line.slice(pos);
      if (rest.trim() === '') {
        lineBuf += rest;
        break;
      }
      if (!LEADING_COMMENT_LINE_RE.test(rest)) {
        // 코드 도달 — 이 줄에서 여기까지 모은 주석 부분만 남기고 전체 스캔을
        // 멈춘다. 이 지점 이후(같은 줄의 나머지 포함)는 선행 블록이 아니다.
        if (lineBuf !== '') kept.push(lineBuf);
        break outer;
      }
      const openMatch = rest.match(BLOCK_OPENER_RE);
      if (openMatch) {
        const opener = openMatch[1] as Opener;
        const openStart = pos + (openMatch[0].length - opener.length);
        const closeAt = line.indexOf(CLOSER[opener], openStart + opener.length);
        if (closeAt === -1) {
          lineBuf += line.slice(pos);
          openBlock = opener;
          break;
        }
        const closeEnd = closeAt + CLOSER[opener].length;
        lineBuf += line.slice(pos, closeEnd);
        pos = closeEnd;
        continue; // 같은 줄 안에서 열리고 닫힌 뒤 나머지를 다시 판정
      }
      // //, #, 단독 */, --> 등 — 나머지 전체를 한 줄 주석으로 소비한다.
      lineBuf += rest;
      break;
    }

    kept.push(lineBuf);
  }

  return kept.join('\n');
}
