// @concept:governance-mode
// tests/hooks/dirFlow.test.ts
// 위치를 바꾸는 명령(cd·pushd)이 뒤 명령의 위치에 언제 남는지 가리는 규칙 하나(dirEffects) — 커밋 판정과 스테이징
// 가늠이 함께 쓴다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 불변 "문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다 — 명령을 실행하기 전에
//    그 파일들을 확정할 수 없으면 검사를 마친 것처럼 통과시키지 않고 강도에 맞춰 대응한다"
//    → 조건 없이 현재 셸에서 실행되는 cd만 뒤 명령의 위치를 확정한다(`cd X && …`·`cd X; …`)
//    → && / || 뒤·if 블록 안의 cd는 같은 && 사슬 안에서만 확정, 사슬이 끝나면 위치 불명
//    → 파이프 앞쪽·백그라운드의 cd는 다른 프로세스라 위치를 바꾸지 않고, 파이프 마지막은 셸마다 달라 위치 불명
//    → 괄호 뒤 구분자(`(a) || cd x`)도 놓치지 않는다
import { describe, it, expect } from 'vitest';
import { parseShellCommand } from '../../src/hooks/command/shellWords.js';
import { dirEffects } from '../../src/hooks/command/dirFlow.js';

// 명령에서 cd 구간의 효과
const cdEffect = (command: string) => {
  const segs = parseShellCommand(command).segments;
  const k = segs.findIndex((s) => s.words.includes('cd'));
  return dirEffects(segs)[k];
};

describe('cd가 뒤 명령의 위치에 남는가 [규칙: 확정할 수 없으면 통과시키지 않는다]', () => {
  for (const cmd of ['cd x && git commit', 'cd x; git commit', 'cd x || exit 1; git commit']) {
    it(`조건 없이 현재 셸: ${cmd} → 확정`, () => {
      expect(cdEffect(cmd)).toEqual({ kind: 'apply' });
    });
  }
  const conditional: [string, number][] = [
    ['false && cd x; git commit', 1],
    ['test -d /x && cd x; git commit', 1],
    ['git diff --quiet || cd x; git commit', 1],
    ['true || cd x; git commit', 1],
    ['false && cd x && git commit; ls', 2],
    ['if test -d x; then cd x; fi; git commit', 1],
    ['(a) || cd x; git commit', 1],
    ['(a) && cd x && git commit', 2],
    // 백그라운드로 도는 목록 안의 cd는 그 목록 안에서만
    ['cd x && true & git commit', 1],
    // 괄호를 여닫는 앞뒤의 구분자도 놓치지 않는다
    ['false && cd x && (a); (git commit)', 2],
    // &&·|| 뒤 줄바꿈은 이어지는 명령이다
    ['false &&\ncd x\ngit commit', 1],
  ];
  for (const [cmd, until] of conditional) {
    it(`조건부: ${cmd} → 사슬(구간 ${until})까지만 확정`, () => {
      expect(cdEffect(cmd)).toEqual({ kind: 'conditional', until });
    });
  }
  for (const cmd of ['cd x | cat; git commit', 'cd x & git commit', 'a && cd x | cat']) {
    it(`다른 프로세스: ${cmd} → 위치 그대로`, () => {
      expect(cdEffect(cmd)).toEqual({ kind: 'none' });
    });
  }
  it('파이프 마지막의 cd는 셸마다 달라 위치 불명', () => {
    expect(cdEffect('cat | cd x; git commit')).toEqual({ kind: 'unknown' });
  });
  it('서브셸 안 첫 cd는 그 서브셸 안에서 조건 없이 실행된다', () => {
    expect(cdEffect('false && (cd x && git commit)')).toEqual({ kind: 'apply' });
    expect(cdEffect('(cd x; git commit)')).toEqual({ kind: 'apply' });
  });
  it('조건부 cd의 사슬은 안쪽 서브셸을 건너 같은 깊이에서 끝난다', () => {
    expect(cdEffect('false && cd x && (git commit; ls) ; pwd')).toEqual({
      kind: 'conditional',
      until: 3,
    });
  });
});
