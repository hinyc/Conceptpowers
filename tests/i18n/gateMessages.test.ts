// @concept:output-locale
// tests/i18n/gateMessages.test.ts
// 커밋 게이트의 사람용 문구표(ko/en)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - output-locale 불변 "사람이 읽을 산출물은 프로젝트에 설정된 언어로 쓴다"
//    → en 문구에는 한글이 없다 / ko 문구는 한국어다 / 두 벌의 키가 같다 / 확정 불가 사유도 두 벌이다
import { describe, it, expect } from 'vitest';
import { gateText } from '../../src/i18n/gateMessages.js';
import { R, otherCommit, impureBefore } from '../../src/i18n/commitReasons.js';

const HANGUL = /[가-힣]/;
const sample = (v: unknown): string =>
  typeof v === 'function'
    ? (v as (...a: unknown[]) => string)(...Array.from({ length: v.length }, () => 'X'))
    : String(v);

describe('gateText', () => {
  it('ko와 en은 같은 키를 가진다', () => {
    expect(Object.keys(gateText.en).sort()).toEqual(Object.keys(gateText.ko).sort());
  });
  it('en 문구에는 한글이 없다', () => {
    for (const [key, v] of Object.entries(gateText.en)) {
      expect(sample(v), key).not.toMatch(HANGUL);
    }
  });
  it('ko 문구는 한국어이고 en과 다르다', () => {
    for (const [key, v] of Object.entries(gateText.ko)) {
      const ko = sample(v);
      expect(ko, key).toMatch(HANGUL);
      expect(ko, key).not.toBe(sample((gateText.en as Record<string, unknown>)[key]));
    }
  });
  it('질문 접미사', () => {
    expect(gateText.ko.askSuffix).toBe(' 그래도 커밋하시겠습니까?');
    expect(gateText.en.askSuffix).toBe(' Commit anyway?');
  });
});

describe('commitReasons', () => {
  const all = [...Object.values(R), otherCommit('merge'), impureBefore(R.redirectWrites)];
  it('모든 사유가 ko/en 두 벌이고 en에는 한글이 없다', () => {
    for (const reason of all) {
      expect(reason('ko')).toMatch(HANGUL);
      expect(reason('en')).not.toMatch(HANGUL);
      expect(reason('en').length).toBeGreaterThan(0);
    }
  });
  it('동적 사유는 인자를 담는다', () => {
    expect(otherCommit('merge')('en')).toContain('git merge');
    expect(impureBefore(R.redirectWrites)('en')).toContain(R.redirectWrites('en'));
  });
});
