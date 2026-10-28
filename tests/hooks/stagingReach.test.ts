// @concept:governance-mode
// tests/hooks/stagingReach.test.ts
// 확정할 수 없는 커밋 명령이 디스크에만 있는 거버넌스 변경까지 담을 수 있는지 가늠하는 판정을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 불변 "거버넌스 설정 파일의 변경·삭제 … 가 커밋에 들어오면 강도와 무관하게 사람에게 묻는다"
//    → 넓게 담는 스테이징(add -A·add .·commit -a·그 경로를 가리키는 add/rm)이나 무엇을 할지 모르는 명령이면 담을 수 있다
//    → 다른 경로만 지정한 스테이징이면 담지 않는다 — 들어가지 않을 변경으로 묻지 않는다
//    → 셸 확장처럼 판단할 수 없으면 담을 수 있는 쪽으로 본다
import { describe, it, expect } from 'vitest';
import { forcedReferenceSpecs, mayStageGovernance } from '../../src/hooks/command/stagingReach.js';

describe('mayStageGovernance', () => {
  const cases: [string, boolean][] = [
    ['git add -A && git commit -m x', true],
    ['git add . && git commit -m x', true],
    ['git add -Av && git commit -m x', true],
    ['git add -u src && git commit -m x', true],
    ['git add docs/conceptpowers && git commit -m x', true],
    ['git add ./docs/ && git commit -m x', true],
    ['git rm docs/conceptpowers/concepts/data/foo.json && git commit -m x', true],
    ['git add src/b.ts && git commit -am x', true],
    ['pnpm format && git commit -m x', true],
    ['git -C sub add x && git commit -m x', true],
    ['git add "$F" && git commit -m x', true],
    ['git add src/*.ts && git commit -m x', true],
    ['git add src/b.ts && git commit -m x', false],
    ['git add src/b.ts tests/b.test.ts; git commit -m "docs: 설명"', false],
    ['git rm src/old.ts && git commit -m x', false],
    ['git status && git add src/b.ts && git commit -F msg.txt', false],
    // 참고자료 기밀 확인은 어느 강도에서나 묻는다 — 참고자료 경로를 가리키는 스테이징도 담을 수 있다
    ['git add docs/conceptpowers/reference/spec.md && git commit -m x', true],
    ['git add -f docs/conceptpowers/reference/new.md && git commit -m x', true],
  ];
  for (const [cmd, expected] of cases) {
    it(`${JSON.stringify(cmd).slice(0, 70)} → ${expected}`, () => {
      expect(mayStageGovernance(cmd)).toBe(expected);
    });
  }
});

// 무시 목록(.gitignore)에 걸린 참고자료는 강제 추가(-f)로만 담긴다 — 강제 추가가 참고자료에 닿는 경로를 돌려준다
// [규칙: 참고자료 기밀 확인은 어느 강도에서나 반드시 사람에게 묻는다].
describe('forcedReferenceSpecs', () => {
  const REF = 'docs/conceptpowers/reference';
  const cases: [string, string[]][] = [
    ['git add -f docs/conceptpowers/reference/new.md && git commit -m x', [`${REF}/new.md`]],
    ['git add --force ./docs/conceptpowers/reference/a.md && git commit -m x', [`${REF}/a.md`]],
    ['git add -fA && git commit -m x', [REF]],
    ['git add -f . && git commit -m x', [REF]],
    ['git add -f docs && git commit -m x', [REF]],
    ['git add -f "$F" && git commit -m x', [REF]],
    ['git add -f src/gen.ts && git commit -m x', []],
    ['git add docs/conceptpowers/reference/spec.md && git commit -m x', []],
    ['git add -A && git commit -m x', []],
  ];
  for (const [cmd, expected] of cases) {
    it(`${JSON.stringify(cmd).slice(0, 70)} → ${JSON.stringify(expected)}`, () => {
      expect(forcedReferenceSpecs(cmd)).toEqual(expected);
    });
  }
});
