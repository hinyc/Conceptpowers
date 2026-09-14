// @concept:governance-mode
// src/hooks/command/shellWords.ts
// Bash 명령 문자열을 "명령 단위(세그먼트) + 단어"로 나눈다. 셸 전체를 구현하지 않는다 — 커밋 게이트가 실제로
// 실행될 명령을 가려내는 데 필요한 만큼만 셸과 같게 읽는다: 따옴표(ANSI-C 포함)·이스케이프, 명령 구분자와 괄호
// 깊이, 리다이렉션(대상·쓰기 여부), heredoc 본문, 그리고 어디에 있든 실행되는 명령 치환. 명령 치환의 끝은 같은
// 해석기로 읽어 찾는다(heredoc·따옴표·괄호를 같은 규칙으로). 닫히지 않았거나 셸마다 달리 읽히는 구문은 표시만
// 하고, 판단은 호출 측이 보수적으로 한다.

export type Connector = ';' | '&&' | '||' | '|' | '&' | '\n' | '(' | ')' | 'end';

export interface ShellSegment {
  words: string[];
  /** 같은 위치의 단어가 셸 확장($VAR·$(...)·`...` 등)을 품어 실행 시 값이 달라질 수 있는지 */
  dynamicWords: boolean[];
  /** 이 명령의 입력으로 흘러 들어가는 heredoc 본문 */
  heredocs: string[];
  /** 이 명령을 실행하기 전에 셸이 실행하는 명령 치환들 */
  substitutions: string[];
  /** 파일에 쓰는 리다이렉션이 있는지 */
  writes: boolean;
  /** 이 명령을 끝낸 구분자 */
  connector: Connector;
  /** 서브셸 괄호 깊이 */
  depth: number;
}

export interface ParsedCommand {
  segments: ShellSegment[];
  /** 닫히지 않은 따옴표·치환·heredoc이 있다 — 셸이 다르게 읽을 수 있다 */
  incomplete: boolean;
  /** 함수 정의가 있다 — 정의한 이름으로 부르는 명령이 무엇을 실행하는지 알 수 없다 */
  functionDefined: boolean;
  /** 셸마다 해석이 갈리는 구문(명령 자리의 (( … )))이 있다 */
  ambiguous: boolean;
}

interface ParseResult extends ParsedCommand {
  closed: boolean;
  end: number;
}

interface ParserOptions {
  /** $( … ) 안 — 짝 없는 ')'에서 멈춘다 */
  nested?: boolean;
  /** $(( … )) 안 — 산술식의 <<를 heredoc으로 오인한 흔적은 불완전으로 치지 않는다 */
  arithmetic?: boolean;
}

type Redirect = { kind: 'discard' } | { kind: 'write' } | { kind: 'heredoc'; strip: boolean };

interface PendingHeredoc {
  delim: string;
  strip: boolean;
  quoted: boolean;
  seg: ShellSegment;
}

const SEPARATORS = new Set([';', '|', '&', '(', ')']);
const NON_WRITING_TARGET = /^(\/dev\/null|-|\d+)$/;

function newSegment(depth: number): ShellSegment {
  return {
    words: [],
    dynamicWords: [],
    heredocs: [],
    substitutions: [],
    writes: false,
    connector: 'end',
    depth,
  };
}

// ${…}·$[…]·(( … ))의 닫는 위치. 따옴표·이스케이프 안은 세지 않는다. 짝이 없으면 -1.
function matchClose(s: string, open: number, openCh: string, closeCh: string): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      i++;
    } else if (c === "'" || c === '"') {
      const end = s.indexOf(c, i + 1);
      if (end < 0) return -1;
      i = end;
    } else if (c === openCh) {
      depth++;
    } else if (c === closeCh && --depth === 0) {
      return i;
    }
  }
  return -1;
}

function closingBacktick(s: string, from: number): number {
  for (let i = from; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '`') return i;
  }
  return -1;
}

// 확장이 일어나는 글(따옴표 없는 heredoc 본문, ${…} 안) 속 명령 치환을 모두 뽑는다.
export function extractSubstitutions(text: string): { subs: string[]; incomplete: boolean } {
  const subs: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') {
      i++;
    } else if (c === '$' && text[i + 1] === '(') {
      const inner = new ShellParser(text, i + 2, { nested: true }).run();
      if (!inner.closed) return { subs: [...subs, text.slice(i + 2)], incomplete: true };
      subs.push(text.slice(i + 2, inner.end));
      i = inner.end;
    } else if (c === '`') {
      const end = closingBacktick(text, i + 1);
      if (end < 0) return { subs: [...subs, text.slice(i + 1)], incomplete: true };
      subs.push(text.slice(i + 1, end));
      i = end;
    }
  }
  return { subs, incomplete: false };
}

class ShellParser {
  private readonly segments: ShellSegment[] = [];
  private readonly pending: PendingHeredoc[] = [];
  private depth = 0;
  private seg = newSegment(0);
  private word: string | null = null;
  private dynamic = false;
  private quoted = false;
  private redirect: Redirect | null = null;
  private incomplete = false;
  private functionDefined = false;
  private ambiguous = false;
  private closedAt = -1;
  private i: number;

  constructor(
    private readonly s: string,
    start = 0,
    private readonly opts: ParserOptions = {}
  ) {
    this.i = start;
  }

  run(): ParseResult {
    while (this.i < this.s.length && this.closedAt < 0) this.step();
    if (this.closedAt < 0) this.endSegment('end');
    if (this.pending.length > 0 && !this.opts.arithmetic) this.incomplete = true;
    if (this.opts.nested && this.closedAt < 0) this.incomplete = true;
    return {
      segments: this.segments,
      incomplete: this.incomplete,
      functionDefined: this.functionDefined,
      ambiguous: this.ambiguous,
      closed: this.closedAt >= 0,
      end: this.closedAt >= 0 ? this.closedAt : this.s.length,
    };
  }

  private step(): void {
    const { s, i } = this;
    const c = s[i];
    const next = s[i + 1];
    if (c === '\\') {
      if (next !== '\n') this.append(next ?? '', { quoted: true });
      this.i += 2;
    } else if (c === "'") {
      const end = s.indexOf("'", i + 1);
      if (end < 0) this.incomplete = true;
      const stop = end < 0 ? s.length : end;
      this.append(s.slice(i + 1, stop), { quoted: true });
      this.i = stop + 1;
    } else if (c === '"') {
      this.readDoubleQuoted();
    } else if (c === '$') {
      this.readDollar(false);
    } else if (c === '`') {
      this.readBacktick();
    } else if (c === '#' && this.word === null) {
      while (this.i < s.length && s[this.i] !== '\n') this.i++;
    } else if (c === '\n') {
      this.endSegment('\n');
      this.i++;
      this.consumeHeredocs();
    } else if (c === '>' || c === '<' || (c === '&' && next === '>')) {
      this.readRedirect();
    } else if (c === '(' && next === '(' && this.word === null && this.seg.words.length === 0) {
      this.readArithmeticCommand();
    } else if (SEPARATORS.has(c)) {
      this.readSeparator();
    } else if (c === ' ' || c === '\t') {
      this.pushWord();
      this.i++;
    } else {
      this.append(c);
      this.i++;
    }
  }

  private append(text: string, flags: { quoted?: boolean; dynamic?: boolean } = {}): void {
    this.word = (this.word ?? '') + text;
    if (flags.quoted) this.quoted = true;
    if (flags.dynamic) this.dynamic = true;
  }

  private readSeparator(): void {
    const { s, i } = this;
    const c = s[i];
    if (c === '(') {
      this.pushWord();
      if (
        this.seg.words.length === 1 &&
        s
          .slice(i + 1)
          .trimStart()
          .startsWith(')')
      ) {
        this.functionDefined = true; // name() { … }
      }
      this.endSegment('(');
      this.depth++;
      this.seg.depth = this.depth;
      this.i++;
      return;
    }
    if (c === ')') {
      this.endSegment(')');
      if (this.opts.nested && this.depth === 0) {
        this.closedAt = i;
        return;
      }
      this.depth = Math.max(0, this.depth - 1);
      this.seg.depth = this.depth;
      this.i++;
      return;
    }
    const two = s.slice(i, i + 2);
    if (two === '&&' || two === '||') {
      this.endSegment(two);
      this.i += 2;
    } else if (two === '|&') {
      this.endSegment('|');
      this.i += 2;
    } else {
      this.endSegment(c as Connector);
      this.i++;
    }
  }

  // 명령 자리의 (( … )): bash는 산술식, 닫힘이 맞지 않으면 서브셸로 읽기도 한다 — 셸마다 갈리므로 표시한다.
  private readArithmeticCommand(): void {
    const end = matchClose(this.s, this.i, '(', ')');
    this.ambiguous = true;
    if (end < 0) this.incomplete = true;
    const stop = end < 0 ? this.s.length - 1 : end;
    this.append(this.s.slice(this.i, stop + 1), { dynamic: true });
    this.i = stop + 1;
  }

  private readDoubleQuoted(): void {
    const { s } = this;
    this.append('', { quoted: true });
    this.i++;
    while (this.i < s.length && s[this.i] !== '"') {
      const c = s[this.i];
      if (c === '\\' && this.i + 1 < s.length && '"\\$`\n'.includes(s[this.i + 1])) {
        if (s[this.i + 1] !== '\n') this.append(s[this.i + 1]);
        this.i += 2;
      } else if (c === '$') {
        this.readDollar(true);
      } else if (c === '`') {
        this.readBacktick();
      } else {
        this.append(c);
        this.i++;
      }
    }
    if (this.i >= s.length) this.incomplete = true;
    this.i++;
  }

  private readDollar(inDouble: boolean): void {
    const { s, i } = this;
    const next = s[i + 1];
    if (next === '(') {
      this.readSubstitution();
    } else if (next === '[' || next === '{') {
      const end = matchClose(s, i + 1, next, next === '[' ? ']' : '}');
      if (end < 0) this.incomplete = true;
      const stop = end < 0 ? s.length - 1 : end;
      const raw = s.slice(i, stop + 1);
      const inner = extractSubstitutions(raw.slice(2));
      this.seg.substitutions.push(...inner.subs);
      if (inner.incomplete) this.incomplete = true;
      this.append(raw, { dynamic: true });
      this.i = stop + 1;
    } else if (!inDouble && next === "'") {
      this.readAnsiC();
    } else if (!inDouble && next === '"') {
      this.i++; // $"…" 로케일 문자열 — 큰따옴표처럼 읽는다
    } else {
      this.append('$', { dynamic: true });
      this.i++;
    }
  }

  // $( … )와 $(( … )): 끝은 같은 해석기로 읽어 찾는다. 산술식이어도 안의 명령 치환은 실행되므로 드러낸다.
  private readSubstitution(): void {
    const { s, i } = this;
    const inner = new ShellParser(s, i + 2, {
      nested: true,
      arithmetic: s[i + 2] === '(',
    }).run();
    if (!inner.closed || inner.incomplete) this.incomplete = true;
    this.seg.substitutions.push(s.slice(i + 2, inner.end));
    this.append(s.slice(i, inner.end + 1), { dynamic: true });
    this.i = inner.end + 1;
  }

  private readAnsiC(): void {
    const { s } = this;
    let j = this.i + 2;
    let text = '';
    while (j < s.length && s[j] !== "'") {
      if (s[j] === '\\' && j + 1 < s.length) {
        text += s[j + 1];
        j += 2;
      } else {
        text += s[j];
        j++;
      }
    }
    if (j >= s.length) this.incomplete = true;
    this.append(text, { quoted: true });
    this.i = j + 1;
  }

  private readBacktick(): void {
    const end = closingBacktick(this.s, this.i + 1);
    if (end < 0) this.incomplete = true;
    const stop = end < 0 ? this.s.length : end;
    this.seg.substitutions.push(this.s.slice(this.i + 1, stop));
    this.append(this.s.slice(this.i, stop + 1), { dynamic: true });
    this.i = stop + 1;
  }

  private readRedirect(): void {
    const { s } = this;
    // "2>&1"의 2처럼 리다이렉션 바로 앞에 붙은 숫자는 단어가 아니라 파일 설명자다.
    if (this.word !== null && !this.quoted && /^\d+$/.test(this.word)) {
      this.word = null;
      this.dynamic = false;
    } else {
      this.pushWord();
    }
    const i = this.i;
    if (s.startsWith('<<<', i)) {
      this.redirect = { kind: 'discard' };
      this.i = i + 3;
    } else if (s.startsWith('<<', i)) {
      const strip = s[i + 2] === '-';
      this.redirect = { kind: 'heredoc', strip };
      this.i = i + (strip ? 3 : 2);
    } else if (s[i] === '<') {
      const twoChar = s[i + 1] === '>' || s[i + 1] === '&';
      this.redirect = { kind: s[i + 1] === '>' ? 'write' : 'discard' };
      this.i = i + (twoChar ? 2 : 1);
    } else {
      let j = i;
      while (j < s.length && '&>|'.includes(s[j])) j++;
      this.redirect = { kind: 'write' };
      this.i = j;
    }
  }

  private pushWord(): void {
    if (this.word === null) return;
    const redirect = this.redirect;
    if (redirect) {
      this.finishRedirect(redirect, this.word);
      this.redirect = null;
    } else {
      this.seg.words.push(this.word);
      this.seg.dynamicWords.push(this.dynamic);
    }
    this.word = null;
    this.dynamic = false;
    this.quoted = false;
  }

  private finishRedirect(redirect: Redirect, target: string): void {
    if (redirect.kind === 'heredoc') {
      this.pending.push({
        delim: target,
        strip: redirect.strip,
        quoted: this.quoted,
        seg: this.seg,
      });
    } else if (redirect.kind === 'write' && (this.dynamic || !NON_WRITING_TARGET.test(target))) {
      this.seg.writes = true;
    }
  }

  private endSegment(connector: Connector): void {
    this.pushWord();
    this.redirect = null;
    const seg = this.seg;
    seg.connector = connector;
    if (seg.words[0] === 'function' && !seg.dynamicWords[0]) this.functionDefined = true;
    if (seg.words.length > 0 || seg.substitutions.length > 0) this.segments.push(seg);
    this.seg = newSegment(this.depth);
  }

  private consumeHeredocs(): void {
    const { s } = this;
    for (const h of this.pending) {
      const body: string[] = [];
      let terminated = false;
      while (this.i < s.length) {
        const nl = s.indexOf('\n', this.i);
        const lineEnd = nl < 0 ? s.length : nl;
        const line = s.slice(this.i, lineEnd);
        this.i = lineEnd + 1;
        if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) {
          terminated = true;
          break;
        }
        body.push(line);
      }
      if (!terminated) this.incomplete = true;
      const text = body.join('\n');
      h.seg.heredocs.push(text);
      // 따옴표 없는 구분자의 본문은 셸이 확장한다 — 그 안의 명령 치환은 실행된다.
      if (!h.quoted) {
        const inner = extractSubstitutions(text);
        if (inner.incomplete) this.incomplete = true;
        if (inner.subs.length > 0) {
          h.seg.substitutions.push(...inner.subs);
          if (!this.segments.includes(h.seg)) this.segments.push(h.seg);
        }
      }
    }
    this.pending.length = 0;
  }
}

export function parseShellCommand(command: string): ParsedCommand {
  const { segments, incomplete, functionDefined, ambiguous } = new ShellParser(command).run();
  return { segments, incomplete, functionDefined, ambiguous };
}
