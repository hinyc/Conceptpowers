// @concept:governance-mode
// tests/hooks/gitAlias.test.ts
// git alias 값 풀이(expandGitAlias) — 커밋 판정과 스테이징 가늠이 같은 풀이를 쓴다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 불변 "문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다 — 명령을 실행하기 전에
//    그 파일들을 확정할 수 없으면 검사를 마친 것처럼 통과시키지 않고 강도에 맞춰 대응한다"
//    → 일반 alias는 git(split_cmdline)처럼 공백·작은/큰따옴표·역슬래시로만 나눈다 — 셸 연산자 글자(| & ; ( ))는 낱말의
//      일부다(확정할 수 있는 것을 확정 불가로 만들지 않는다)
//    → git이 거절하는 값(닫히지 않은 따옴표·끝의 역슬래시)과 줄바꿈이 든 값은 판단 불가
//    → 셸 alias(!)는 셸 문법 그대로 셸이 실행할 명령 글로 넘긴다
import { describe, it, expect } from 'vitest';
import { expandGitAlias } from '../../src/hooks/command/gitAlias.js';

const words = (value: string) => {
  const r = expandGitAlias(value, [], []);
  return r.kind === 'git' ? r.words : r.kind;
};

describe('일반 alias 나누기 [규칙: 커밋에 실제로 들어갈 파일 기준]', () => {
  const cases: [string, string[]][] = [
    ['log --format=%h|%s', ['log', '--format=%h|%s']],
    ['log --format=%C(auto)%h%d', ['log', '--format=%C(auto)%h%d']],
    ['commit -a;x', ['commit', '-a;x']],
    ['commit -m "a b"', ['commit', '-m', 'a b']],
    ['commit -m \'a "b"\'', ['commit', '-m', 'a "b"']],
    ['commit -m a\\ b', ['commit', '-m', 'a b']],
    ['commit -m "a\\"b"', ['commit', '-m', 'a"b']],
    ['  commit \t -a  ', ['commit', '-a']],
    ['log $HOME', ['log', '$HOME']],
  ];
  for (const [value, expected] of cases) {
    it(`${value} → ${JSON.stringify(expected)}`, () => {
      expect(words(value)).toEqual(expected);
    });
  }
  it('셸 확장 글자도 git은 그대로 넘긴다 — 셸 확장 낱말로 보지 않는다', () => {
    const r = expandGitAlias('log $HOME', [], []);
    expect(r.kind === 'git' && r.dynamic).toEqual([false, false]);
  });
  for (const value of ['commit -m "x', "commit -m 'x", 'commit \\', 'commit\n-a']) {
    it(`git이 거절하거나 줄바꿈이 든 값은 판단 불가: ${JSON.stringify(value)}`, () => {
      expect(words(value)).toBe('undecidable');
    });
  }
  it('셸 alias는 셸이 실행할 명령 글로 넘긴다', () => {
    expect(expandGitAlias('!git add -A && git commit', ["it's"], [false])).toEqual({
      kind: 'shell',
      command: "git add -A && git commit 'it'\\''s'",
    });
  });
});
