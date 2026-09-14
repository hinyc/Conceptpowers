// @concept:governance-mode
// tests/hooks/shellWords.test.ts
// 커밋 게이트가 명령을 해석하는 바탕인 셸 단어 분해(parseShellCommand)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 불변 "문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다 — 명령을 실행하기 전에
//    그 파일들을 확정할 수 없으면 검사를 마친 것처럼 통과시키지 않는다"
//    → 실제 셸이 실행할 명령 단위와 단어를 셸과 같게 나눈다(따옴표·ANSI-C 따옴표·이스케이프·구분자)
//    → 실행되는 명령 치환은 어디에 있든(단어·heredoc 본문·리다이렉션 대상) 그 명령 단위에 붙여 드러낸다
//    → 파일에 쓰는 리다이렉션은 표시하고, 산술식·주석이 뒤 명령을 삼키지 않는다
import { describe, it, expect } from 'vitest';
import { parseShellCommand } from '../../src/hooks/command/shellWords.js';

const words = (cmd: string) => parseShellCommand(cmd).segments.map((s) => s.words);

describe('parseShellCommand', () => {
  it('따옴표·이스케이프·구분자를 셸과 같게 나눈다', () => {
    expect(words(`a "b c" 'd' e\\ f; g && h || i | j & k`)).toEqual([
      ['a', 'b c', 'd', 'e f'],
      ['g'],
      ['h'],
      ['i'],
      ['j'],
      ['k'],
    ]);
  });

  it("ANSI-C 따옴표($'…') 안의 이스케이프된 따옴표로 상태가 어긋나지 않는다", () => {
    expect(words("echo $'a\\'b' ; git status")).toEqual([
      ['echo', "a'b"],
      ['git', 'status'],
    ]);
  });

  it('명령 치환은 그 명령 단위에 붙는다(실행 순서 보존)', () => {
    const { segments } = parseShellCommand('git commit -m x; echo $(git add -A)');
    expect(segments[0].substitutions).toEqual([]);
    expect(segments[1].substitutions).toEqual(['git add -A']);
  });

  it('따옴표 없는 heredoc 본문의 명령 치환은 드러내고, 따옴표 heredoc 본문은 글자로 둔다', () => {
    const plain = parseShellCommand('cat <<EOF\n$(git add -A)\nEOF');
    expect(plain.segments[0].substitutions).toEqual(['git add -A']);
    const quoted = parseShellCommand("cat <<'EOF'\n$(git add -A)\nEOF");
    expect(quoted.segments[0].substitutions).toEqual([]);
    expect(quoted.segments[0].heredocs).toEqual(['$(git add -A)']);
  });

  it('리다이렉션 대상 안의 명령 치환도 드러낸다', () => {
    expect(parseShellCommand('echo hi > "$(git add -A)"').segments[0].substitutions).toEqual([
      'git add -A',
    ]);
    expect(parseShellCommand('echo hi >`git add -A`').segments[0].substitutions).toEqual([
      'git add -A',
    ]);
  });

  it('파일에 쓰는 리다이렉션만 쓰기로 표시한다', () => {
    const [toFile] = parseShellCommand('echo x > out.txt').segments;
    const [devNull] = parseShellCommand('echo x >/dev/null 2>&1').segments;
    expect(toFile.writes).toBe(true);
    expect(toFile.words).toEqual(['echo', 'x']);
    expect(devNull.writes).toBe(false);
    expect(devNull.words).toEqual(['echo', 'x']);
  });

  it('산술식의 << 는 heredoc이 아니어서 다음 줄 명령을 삼키지 않는다', () => {
    expect(words('(( x = 1<<2 ))\ngit status').at(-1)).toEqual(['git', 'status']);
    expect(words('echo $[1<<2]\ngit status').at(-1)).toEqual(['git', 'status']);
  });

  it('명령 치환의 끝은 셸처럼 읽는다 — heredoc 본문의 작은따옴표·짝 없는 괄호에 흔들리지 않는다', () => {
    const cmd = "git commit -m \"$(cat <<'EOF'\nfix: don't 1) `x`\nEOF\n)\"; git status";
    const parsed = parseShellCommand(cmd);
    expect(parsed.incomplete).toBe(false);
    expect(parsed.segments.map((s) => s.words[0])).toEqual(['git', 'git']);
    expect(parsed.segments[0].substitutions).toHaveLength(1);
    expect(parsed.segments[1].words).toEqual(['git', 'status']);
  });

  it('산술식처럼 보이는 $(( … ) )도 명령 치환으로 드러낸다', () => {
    expect(
      parseShellCommand('echo $((git add -A) )').segments[0].substitutions.join(' ')
    ).toContain('git add -A');
  });

  it('닫히지 않은 따옴표·치환은 불완전으로 표시한다', () => {
    expect(parseShellCommand('echo "abc').incomplete).toBe(true);
    expect(parseShellCommand('echo $(git status').incomplete).toBe(true);
    expect(parseShellCommand('echo "${x-\'}"; git status').incomplete).toBe(true);
    expect(parseShellCommand('echo ok').incomplete).toBe(false);
  });

  it('구분자 종류·괄호 깊이·함수 정의를 기록한다', () => {
    const { segments } = parseShellCommand('a | b & c; (d); e');
    expect(segments.map((s) => s.connector)).toEqual(['|', '&', ';', ')', 'end']);
    expect(segments.map((s) => s.depth)).toEqual([0, 0, 0, 1, 0]);
    expect(parseShellCommand('f() { g; }; f').functionDefined).toBe(true);
    expect(parseShellCommand('function f { g; }').functionDefined).toBe(true);
    expect(parseShellCommand('echo "f()"').functionDefined).toBe(false);
  });

  it('주석과 줄 이음을 처리한다', () => {
    expect(words('git status # git commit -am x\ngit \\\n  log')).toEqual([
      ['git', 'status'],
      ['git', 'log'],
    ]);
  });
});
