// @concept:concept-code-mapping @concept:drift-reconcile
// tests/mapping/leadingComment.test.ts
// 첫머리 주석 블록 뒤에 실제 코드가 있는지 가려내는 판정을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - drift-reconcile 불변 "첫머리 표식만 있고 코드가 없는 파일은 따라온 코드로 세지 않는다"
//    → 주석·빈 줄만 있는 파일은 코드 없음 / 주석 뒤에 한 줄이라도 코드가 있으면 코드 있음
//    → 세미콜론·빈 괄호·빈 내보내기·문서 문자열·뒤따르는 주석만 있는 파일도 코드 없음
//  - concept-code-mapping 불변 "표식은 파일 첫머리(첫 코드 줄이 나오기 전 주석 부분)에서만 읽는다"
//    → 같은 줄에서 블록 주석이 닫힌 뒤의 나머지도 코드로 본다
import { describe, it, expect } from 'vitest';
import { hasCodeAfterLeadingComment } from '../../src/mapping/leadingComment.js';

describe('hasCodeAfterLeadingComment', () => {
  it('주석만 있는 파일은 코드가 없다', () => {
    expect(hasCodeAfterLeadingComment('// @concept:foo\n')).toBe(false);
    expect(hasCodeAfterLeadingComment('/* @concept:foo */\n\n  \n')).toBe(false);
    expect(hasCodeAfterLeadingComment('# @concept:foo\n# more\n')).toBe(false);
  });
  it('빈 파일은 코드가 없다', () => {
    expect(hasCodeAfterLeadingComment('')).toBe(false);
    expect(hasCodeAfterLeadingComment('\n\n')).toBe(false);
  });
  it('주석 뒤에 코드가 한 줄이라도 있으면 코드가 있다', () => {
    expect(hasCodeAfterLeadingComment('// @concept:foo\nexport const x = 1;\n')).toBe(true);
    expect(hasCodeAfterLeadingComment('# @concept:foo\nimport os\n')).toBe(true);
  });
  it('같은 줄에서 블록 주석이 닫힌 뒤의 나머지도 코드다', () => {
    expect(hasCodeAfterLeadingComment('/* @concept:foo */ export const x = 1;\n')).toBe(true);
  });
  it('닫히지 않은 블록 주석은 파일 전체가 주석이므로 코드가 없다', () => {
    expect(hasCodeAfterLeadingComment('/* @concept:foo\nexport const x = 1;\n')).toBe(false);
  });
  it('구두점·빈 내보내기·문서 문자열·뒤따르는 주석만 있으면 코드가 없다', () => {
    expect(hasCodeAfterLeadingComment('// @concept:foo\n;\n')).toBe(false);
    expect(hasCodeAfterLeadingComment('// @concept:foo\nexport {};\n{}\n')).toBe(false);
    expect(hasCodeAfterLeadingComment('# @concept:foo\n"""\n문서\n"""\npass\n')).toBe(false);
    expect(hasCodeAfterLeadingComment('// @concept:foo\n;\n// 나중에 채움\n')).toBe(false);
  });
});
