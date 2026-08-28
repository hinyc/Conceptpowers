// @concept:concept-code-mapping
// tests/util/glob.test.ts
// 무시 목록(ignoreGlobs) 매칭에 쓰이는 glob 판정을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - concept-code-mapping 구성요소 "대상: 사람이 손으로 쓴 코드 파일 — … 무시 목록에 등록된 생성물·외부
//    코드는 대상이 아니다" → 무엇이 무시 목록에 걸리는지를 가르는 판정 전부(단일 세그먼트 * / 임의 경로
//    ** / 디렉터리 글롭 / 접두 글롭 / config 글롭 / 여러 글롭 중 하나 / 빈 목록)
//  - concept-code-mapping 제한 "진짜 생성물이 아닌 파일을 무시 목록에 넣어 감사에서 빼돌리는 것"
//    → 경계 시나리오가 매칭 범위를 필요 이상으로 넓히지 않음을 지킨다: **/dir/** 는 이름이 dir로 끝나는
//      형제 디렉터리를 매칭하지 않는다 / 정규식 특수문자를 리터럴로 취급한다
//  - 백슬래시 경로 정규화는 개념 규칙이 아니라 같은 경로를 다르게 세지 않기 위한 구현 세부다.
import { describe, it, expect } from 'vitest';
import { matchesAny } from '../../src/util/glob.js';

describe('matchesAny', () => {
  it('* 는 슬래시를 넘지 않는 단일 세그먼트만 매칭한다', () => {
    expect(matchesAny('a.ts', ['*.ts'])).toBe(true);
    expect(matchesAny('src/a.ts', ['*.ts'])).toBe(false);
  });
  it('** 는 슬래시를 포함한 임의 경로를 매칭한다', () => {
    expect(matchesAny('src/a.d.ts', ['**/*.d.ts'])).toBe(true);
    expect(matchesAny('a.d.ts', ['**/*.d.ts'])).toBe(true);
    expect(matchesAny('src/deep/x.d.ts', ['**/*.d.ts'])).toBe(true);
    expect(matchesAny('src/a.ts', ['**/*.d.ts'])).toBe(false);
  });
  it('디렉터리 글롭(**/types/**)을 매칭한다', () => {
    expect(matchesAny('src/types/foo.ts', ['**/types/**'])).toBe(true);
    expect(matchesAny('types/foo.ts', ['**/types/**'])).toBe(true);
    expect(matchesAny('src/typesx/foo.ts', ['**/types/**'])).toBe(false);
  });
  it('**/dir/** 는 이름이 dir로 끝나는 형제 디렉터리를 매칭하지 않는다(경계)', () => {
    expect(matchesAny('src/mytypes/x.ts', ['**/types/**'])).toBe(false);
    expect(matchesAny('prototypes/x.ts', ['**/types/**'])).toBe(false);
    expect(matchesAny('src/util/glob.ts', ['**/utils/**'])).toBe(false);
  });
  it('경로 중간 bare ** 는 임의 깊이를 매칭한다', () => {
    expect(matchesAny('a/b', ['a/**/b'])).toBe(true);
    expect(matchesAny('a/x/y/b', ['a/**/b'])).toBe(true);
  });
  it('접두 디렉터리 글롭(scripts/**)을 매칭한다', () => {
    expect(matchesAny('scripts/build.mjs', ['scripts/**'])).toBe(true);
    expect(matchesAny('src/scripts/x.ts', ['scripts/**'])).toBe(false);
  });
  it('config 글롭(**/*.config.*)을 매칭한다', () => {
    expect(matchesAny('vite.config.ts', ['**/*.config.*'])).toBe(true);
    expect(matchesAny('src/app.config.js', ['**/*.config.*'])).toBe(true);
  });
  it('여러 글롭 중 하나라도 매칭되면 true', () => {
    expect(matchesAny('src/utils/x.ts', ['**/types/**', '**/utils/**'])).toBe(true);
  });
  it('빈 글롭 목록이면 항상 false', () => {
    expect(matchesAny('src/a.ts', [])).toBe(false);
  });
  it('정규식 특수문자를 리터럴로 취급한다', () => {
    expect(matchesAny('a+b.ts', ['a+b.ts'])).toBe(true);
    expect(matchesAny('axb.ts', ['a+b.ts'])).toBe(false);
  });
  it('백슬래시 경로를 정규화해 매칭한다', () => {
    expect(matchesAny('src\\types\\foo.ts', ['**/types/**'])).toBe(true);
  });
});
