// @concept:plugin-version-sync
// 버전 비교(isNewer)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - plugin-version-sync 허용 "생성물에 찍힌 버전 도장이 깔린 도구와 다를 때만 생성물을 다시 만드는 것"
//    → 더 높으면 true / 같거나 낮으면 false (맞출지 말지를 가르는 판정)
//  - plugin-version-sync 불변 "이미 존재하는 파일의 내용은 지우거나 바꾸지 않는다"
//    → 형식이 아니면 false로 본다 (판단이 서지 않을 때 덮어쓰지 않는 쪽으로 기운다)
import { describe, it, expect } from 'vitest';
import { isNewer } from '../../src/version/compareSemver.js';

describe('isNewer', () => {
  it('major/minor/patch가 더 높으면 true', () => {
    expect(isNewer('1.0.0', '0.9.9')).toBe(true);
    expect(isNewer('0.2.0', '0.1.9')).toBe(true);
    expect(isNewer('0.1.1', '0.1.0')).toBe(true);
  });
  it('같거나 낮으면 false', () => {
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('0.1.0', '0.2.0')).toBe(false);
    expect(isNewer('1.0.0', '2.0.0')).toBe(false);
  });
  it('형식이 아니면 false(안전 측)', () => {
    expect(isNewer('1.0', '0.9.9')).toBe(false);
    expect(isNewer('abc', '0.1.0')).toBe(false);
    expect(isNewer('1.0.0', '')).toBe(false);
  });
});
