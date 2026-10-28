// @concept:governance-mode
// src/hooks/command/gitAlias.ts
// git alias 값의 풀이 하나 — 커밋 판정(commitPlan)과 스테이징 가늠(stagingReach)이 같은 풀이를 쓴다. 셸 alias(!…)는
// 셸이 실행할 명령 글로, 일반 alias는 하위 명령과 앞붙는 인자로 푼다. 일반 alias는 git(split_cmdline)처럼 공백·
// 작은/큰따옴표·역슬래시로만 나눈다 — 셸 연산자(| & ; ( ))는 낱말의 일부이고 셸 확장도 일어나지 않는다. 펼친 뒤 어떻게
// 나뉠지 확정할 수 없으면(줄바꿈이 든 값·git이 거절하는 값·셸 확장 인자를 받는 셸 alias) 판단 불가다 — 확정 못 한
// 것을 확정한 것처럼 읽지 않는다(governance-mode).

export type GitAliasExpansion =
  | { kind: 'shell'; command: string }
  | { kind: 'git'; words: string[]; dynamic: boolean[] }
  | { kind: 'undecidable'; reason: string };

const undecidable = (reason: string): GitAliasExpansion => ({ kind: 'undecidable', reason });
const quote = (arg: string): string => `'${arg.replace(/'/g, `'\\''`)}'`;

/** alias 값과 그 뒤에 붙은 인자(rest)를 실제로 실행될 모양으로 푼다 */
export function expandGitAlias(
  value: string,
  rest: readonly string[],
  restDyn: readonly boolean[]
): GitAliasExpansion {
  if (/[\r\n]/.test(value)) return undecidable('줄바꿈이 든 git alias');
  if (value.startsWith('!')) {
    if (restDyn.some(Boolean)) return undecidable('셸 확장 인자를 받는 셸 alias');
    return { kind: 'shell', command: [value.slice(1), ...rest.map(quote)].join(' ') };
  }
  const words = splitCmdline(value);
  if (words === null)
    return undecidable('git이 나눌 수 없는 git alias(닫히지 않은 따옴표·끝의 역슬래시)');
  return { kind: 'git', words, dynamic: words.map(() => false) };
}

// git split_cmdline: 따옴표 밖 공백에서 나누고, 작은/큰따옴표는 묶기만 하며, 역슬래시는 작은따옴표 밖에서 다음 글자를
// 그대로 둔다. 닫히지 않은 따옴표·끝의 역슬래시는 git이 거절하므로 null.
function splitCmdline(value: string): string[] | null {
  const words: string[] = [];
  let word: string | null = null;
  let quote: string | null = null;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (!quote && /\s/.test(c)) {
      if (word !== null) words.push(word);
      word = null;
    } else if (!quote && (c === "'" || c === '"')) {
      quote = c;
      word ??= '';
    } else if (c === quote) {
      quote = null;
    } else if (c === '\\' && quote !== "'") {
      if (++i >= value.length) return null;
      word = (word ?? '') + value[i];
    } else {
      word = (word ?? '') + c;
    }
  }
  if (quote) return null;
  return word === null ? words : [...words, word];
}
