// @concept:governance-mode
// tests/hooks/stagingReach.test.ts
// 확정할 수 없는 커밋 명령이 디스크에만 있는 거버넌스 변경까지 담을 수 있는지 가늠하는 판정을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 불변 "거버넌스 설정 파일의 변경·삭제 … 가 커밋에 들어오면 강도와 무관하게 사람에게 묻는다"
//    → 넓게 담는 스테이징(add -A·add .·commit -a·그 경로를 가리키는 add/rm)이나 무엇을 할지 모르는 명령이면 담을 수 있다
//    → 다른 경로만 지정한 스테이징이면 담지 않는다 — 들어가지 않을 변경으로 묻지 않는다
//    → 셸 확장처럼 판단할 수 없으면 담을 수 있는 쪽으로 본다
//  - governance-mode 불변 "참고자료 기밀 확인은 어느 강도에서나 반드시 사람에게 묻는다"
//    → 참고자료 경로는 설정·판단 기록과 따로 가늠한다(참고자료만 좁게 담는 명령이 판단 기록까지 담는다고 보지 않는다)
//    → 경로 표기(중간 ./·a/../·절대경로)·위치 바꾸기(cd·git -C)·git 전역 옵션·셸 확장·감싼 명령으로 피하지 못한다
//      — 판단할 수 없으면 참고자료 폴더 전체로 기운다(위치를 모르거나 git이 답하지 못한 루트 밖이어도)
//  - governance-mode 불변 "문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다"
//    → 무시된 참고자료는 강제 추가로만 담기므로, -f 흔적(또는 그 자리에 올 수 있는 셸 확장)이 없으면 강제 추가 경로를 비운다
//    → 위치는 절대경로로 따라가고(밖에서 출발해도 절대경로 cd·-C는 다시 정해진다), git이 읽는 위치가 다른 저장소면 담지 않는다
//    → 넓은 옵션에 경로가 붙으면 설정을 직접 담는지는 그 경로로 가린다 / alias는 커밋 판정과 같은 풀이로 읽는다
import { describe, it, expect } from 'vitest';
import { pendingOptionsFor, stagingReach } from '../../src/hooks/command/stagingReach.js';
import { CASE_INSENSITIVE_FS } from '../../src/paths.js';

const ROOT = '/nonexistent-cp-root/proj';
const REF = 'docs/conceptpowers/reference';
const C = 'git ' + 'commit -m x';

describe('stagingReach.mayStageGovernance (설정·판단 기록·개념 문서)', () => {
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
    // git -C로 옮긴 위치에서 경로를 읽는다 — 옮겨도 같은 경로로 본다
    ['git -C sub add x && git commit -m x', false],
    ['git -C docs add conceptpowers/init.json && git commit -m x', true],
    ['git -C /elsewhere add x && git commit -m x', true],
    ['git add "$F" && git commit -m x', true],
    ['git add src/*.ts && git commit -m x', true],
    ['git add src/b.ts && git commit -m x', false],
    ['git add src/b.ts tests/b.test.ts; git commit -m "docs: 설명"', false],
    ['git rm src/old.ts && git commit -m x', false],
    ['git status && git add src/b.ts && git commit -F msg.txt', false],
    // 경로 표기를 바꿔도 같은 경로로 본다
    ['git add docs/conceptpowers/./init.json && git commit -m x', true],
    ['git add src/../docs/conceptpowers/init.json && git commit -m x', true],
    [`git add ${ROOT}/docs/conceptpowers/init.json && git commit -m x`, true],
    [`git add ${ROOT}/src/b.ts && git commit -m x`, false],
    ['git -C . add src/b.ts && git commit -m x', false],
    ['git --no-pager add src/b.ts && git commit -m x', false],
    ['cd docs && git add conceptpowers/init.json && cd .. && git commit -m x', true],
    ['git add --pathspec-from-file=list.txt && git commit -m x', true],
    // 저장소를 바꾸는 전역 옵션(--config-env core.worktree)은 위치 불명 — 넓게 (M1)
    ['git --config-env=core.worktree=E add src/b.ts && git commit -m x', true],
    ['git --config-env core.worktree=E add src/b.ts && git commit -m x', true],
    // 참고자료만 좁게 담는 명령은 판단 기록·설정까지 담지 않는다 (P3)
    [`git add ${REF}/spec.md && ${C}`, false],
    [`git add -f ${REF}/new.md && ${C}`, false],
  ];
  for (const [cmd, expected] of cases) {
    it(`${JSON.stringify(cmd).slice(0, 80)} → ${expected}`, () => {
      expect(stagingReach(cmd, ROOT).mayStageGovernance).toBe(expected);
    });
  }
});

// 참고자료 기밀 확인은 어느 강도에서나 묻는다 — 디스크의 추적 중 참고자료 변경을 담을 수 있는가.
describe('stagingReach.mayStageReference [규칙: 참고자료 기밀 확인은 어느 강도에서나 묻는다]', () => {
  const cases: [string, boolean][] = [
    [`git add ${REF}/spec.md && ${C}`, true],
    [`git add docs/conceptpowers/./reference/spec.md && ${C}`, true],
    [`git add docs/x/../conceptpowers/reference/spec.md && ${C}`, true],
    [`git -C . add ${REF}/spec.md && ${C}`, true],
    [`cd docs && git add conceptpowers/reference/spec.md && cd .. && ${C}`, true],
    [`git add ${ROOT}/${REF}/spec.md && ${C}`, true],
    [`env git add ${REF}/spec.md && ${C}`, true],
    [`sh -c 'git add ${REF}/spec.md' && ${C}`, true],
    ['git add -A && git commit -m x', true],
    ['pnpm test && git commit -m x', true],
    ['git add src/b.ts && git commit -m x', false],
    [`git add /elsewhere/${REF}/spec.md && ${C}`, false],
    ['git add docs/conceptpowers/init.json && git commit -m x', false],
  ];
  for (const [cmd, expected] of cases) {
    it(`${JSON.stringify(cmd).slice(0, 80)} → ${expected}`, () => {
      expect(stagingReach(cmd, ROOT).mayStageReference).toBe(expected);
    });
  }
});

// 무시 목록(.gitignore)에 걸린 참고자료는 강제 추가(-f)로만 담긴다 — 강제 추가가 참고자료에 닿는 경로를 돌려준다
// [규칙: 참고자료 기밀 확인은 어느 강도에서나 반드시 사람에게 묻는다].
describe('stagingReach.forcedReference', () => {
  const cases: [string, string[]][] = [
    [`git add -f ${REF}/new.md && ${C}`, [`${REF}/new.md`]],
    [`git add --force ./${REF}/a.md && ${C}`, [`${REF}/a.md`]],
    ['git add -fA && git commit -m x', [REF]],
    ['git add -f . && git commit -m x', [REF]],
    ['git add -f docs && git commit -m x', [REF]],
    ['git add -f "$F" && git commit -m x', [REF]],
    ['git add -f src/gen.ts && git commit -m x', []],
    [`git add ${REF}/spec.md && ${C}`, []],
    ['git add -A && git commit -m x', []],
    // 재현된 우회 형태 (P1 a~e)
    [`git add -f docs/conceptpowers/./reference/new.md && ${C}`, [`${REF}/new.md`]],
    [`git -C . add -f ${REF}/new.md && ${C}`, [`${REF}/new.md`]],
    [`git --no-pager add -f ${REF}/new.md && ${C}`, [`${REF}/new.md`]],
    [`git -c core.quotepath=off add -f ${REF}/new.md && ${C}`, [`${REF}/new.md`]],
    [`cd docs && git add -f conceptpowers/reference/new.md && cd .. && ${C}`, [`${REF}/new.md`]],
    [`git -C docs add -f conceptpowers/reference/new.md && ${C}`, [`${REF}/new.md`]],
    [`git add -f ${ROOT}/${REF}/new.md && ${C}`, [`${REF}/new.md`]],
    [`F=-f; git add $F ${REF}/new.md && ${C}`, [REF]],
    [`git add "$F" ${REF}/new.md && ${C}`, [REF]],
    // 감싼 명령(env)도 벗겨 실제 git add로 읽는다 — 경로가 그대로 잡힌다
    [`env git add -f ${REF}/new.md && ${C}`, [`${REF}/new.md`]],
    [`sh -c 'git add -f ${REF}/new.md' && ${C}`, [REF]],
    [`ls ${REF} | xargs git add -f && ${C}`, [REF]],
    [`git add -f ${REF}/new.md; ${C}`, [`${REF}/new.md`]],
    [`git add -f /elsewhere/${REF}/new.md && ${C}`, []],
    // 중괄호 확장은 글롭처럼 넓게 본다 (B1)
    [`git add -f docs/conceptpowers/{reference/new.md,init.json} && ${C}`, [REF]],
    // 긴 옵션 줄임(git의 유일 접두사) (C1)
    [`git add --forc ${REF}/x.md && ${C}`, [`${REF}/x.md`]],
    [`git add --f ${REF}/x.md && ${C}`, [`${REF}/x.md`]],
    // git 내장이 아닌 하위 명령(별칭일 수 있음)에 강제 추가 흔적이 있으면 참고자료 폴더 전체 (C2)
    [`git a -f ${REF}/x.md && ${C}`, [REF]],
    [`git a src/b.ts && ${C}`, []],
    // 래퍼·대입 접두어 뒤 cd도 위치 바꾸기로 읽는다 (A3)
    [`builtin cd docs && git add -f conceptpowers/reference/x && ${C}`, [`${REF}/x`]],
    [`command cd docs && git add -f conceptpowers/reference/x && ${C}`, [`${REF}/x`]],
    [`FOO=1 cd docs && git add -f conceptpowers/reference/x && ${C}`, [`${REF}/x`]],
    // 서브셸 안의 cd는 밖에 남지 않는다 (B3)
    [`(cd docs) && git add -f ${REF}/x && ${C}`, [`${REF}/x`]],
    [`cd docs && (cd .. && true) && git add -f conceptpowers/reference/x && ${C}`, [`${REF}/x`]],
    [`(cd docs && git add -f conceptpowers/reference/x) && ${C}`, [`${REF}/x`]],
    // 위치를 확정할 수 없는 cd는 넓게
    [`eval "cd docs" && git add -f conceptpowers/reference/x && ${C}`, [REF]],
    [`cd "$D" && git add -f x && ${C}`, [REF]],
    // git 전역 옵션은 커밋 판정과 같은 뜻 풀이로 읽는다 (M1): -C ~는 위치 불명, -c alias.*는 풀어서 읽는다
    [`git -C ~/x add -f ${REF}/n.md && ${C}`, [REF]],
    [`git -c alias.a='add -f' a ${REF}/n.md && ${C}`, [`${REF}/n.md`]],
    [`git -c alias.a='!git add -f' a ${REF}/n.md && ${C}`, [REF]],
    [`git -c alias.a='add' a ${REF}/n.md && ${C}`, []],
    // add·-f 흔적이 없는 일반 명령은 무시된 참고자료를 담지 않는다 — 강제 추가 없이는 커밋에 들어가지 않는다
    // [규칙: 문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다]
    ['pnpm test && git commit -m x', []],
    ['rm -rf build && git add src/b.ts && git commit -m x', []],
    ['pnpm add -f lodash && git commit -m x', []],
  ];
  for (const [cmd, expected] of cases) {
    it(`${JSON.stringify(cmd).slice(0, 80)} → ${JSON.stringify(expected)}`, () => {
      expect(stagingReach(cmd, ROOT).forcedReference).toEqual(expected);
    });
  }
});

// 셸 확장으로 강제 추가를 추정하는 범위 — 확장이 플래그 자리에 올 수 있을 때만 (A2)
// [규칙: 문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다] — 강제 추가 없이는 무시된 참고자료가 커밋에 들어가지 않는다.
describe('stagingReach.forcedReference — 셸 확장 속 강제 추가 추정', () => {
  const cases: [string, string[]][] = [
    // 묻지 않는다: 단일 낱말 변수·강제 추가 흔적 없는 명령 치환
    [`git add "$f" && ${C}`, []],
    [`git add $(git diff --name-only src) && ${C}`, []],
    // 참고자료 경로 글자가 보여도 -f 흔적이 없으면 강제 추가가 아니다 (M2) — 추적·비무시 참고자료는 mayStageReference가 잡는다
    [`git add "$D/${REF}/new.md" && ${C}`, []],
    [`git add $(git diff --name-only ${REF}) && ${C}`, []],
    // 반복문 변수는 반복 목록·파이프 앞에 -f 흔적이 없으면 강제 추가가 아니다 (L4)
    [`for f in a b; do git add "$f"; done && ${C}`, []],
    [`for f in $(git diff --name-only); do git add "$f"; done && ${C}`, []],
    [`git diff --name-only | while read f; do git add "$f"; done && ${C}`, []],
    // 계속 묻는다: 같은 명령의 -f 대입·경로 앞 변수·치환 속 -f·반복 목록/파이프 앞의 -f
    [`F=-f; git add $F ${REF}/new.md && ${C}`, [REF]],
    [`git add "$F" ${REF}/new.md && ${C}`, [REF]],
    [`f="-f ${REF}/new.md"; git add $f && ${C}`, [REF]],
    [`git add $(echo -f) ${REF}/new.md && ${C}`, [REF]],
    [`for f in "-f ${REF}/x"; do git add $f; done && ${C}`, [REF]],
    [`echo -f | while read f; do git add $f; done && ${C}`, [REF]],
  ];
  for (const [cmd, expected] of cases) {
    it(`${JSON.stringify(cmd).slice(0, 80)} → ${JSON.stringify(expected)}`, () => {
      expect(stagingReach(cmd, ROOT).forcedReference).toEqual(expected);
    });
  }
});

// 넓은 스테이징의 긴 옵션 줄임·커밋 인자는 git과 같게 읽는다 (B4·C1)
// [규칙: 거버넌스 설정 파일의 변경·삭제 … 가 커밋에 들어오면 강도와 무관하게 사람에게 묻는다]
describe('stagingReach.mayStageGovernance — 옵션 줄임·커밋 인자', () => {
  const G = 'git ' + 'commit';
  const cases: [string, boolean][] = [
    [`git add --al && ${C}`, true],
    [`git add --upd && ${C}`, true],
    [`git add --no-ignore-removal && ${C}`, true],
    [`git add src/b.ts && ${G} --al -m x`, true],
    [`git add src/b.ts && ${G} --pathspec-from-file=l.txt -m x`, true],
    [`git add src/b.ts && ${G} --mess x src/b.ts`, false],
    [`git add docs/conceptpowers/{init.json,x} && ${C}`, true],
  ];
  for (const [cmd, expected] of cases) {
    it(`${JSON.stringify(cmd).slice(0, 80)} → ${expected}`, () => {
      expect(stagingReach(cmd, ROOT).mayStageGovernance).toBe(expected);
    });
  }
});

// 훅이 알려 준 작업 폴더에서 경로를 읽는다 — 하위 폴더에서 친 명령도 같은 파일로 본다 (A4)
// [규칙: 참고자료 기밀 확인은 어느 강도에서나 반드시 사람에게 묻는다]
describe('stagingReach — 훅 작업 폴더(cwd) 기준', () => {
  const REF_DIR = `${ROOT}/${REF}`;
  it('참고자료 폴더에서 git add -f new.md → 그 경로', () => {
    expect(stagingReach(`git add -f new.md && ${C}`, ROOT, REF_DIR).forcedReference).toEqual([
      `${REF}/new.md`,
    ]);
  });
  it('참고자료 폴더에서 git add spec.md → 참고자료를 담는다', () => {
    expect(stagingReach(`git add spec.md && ${C}`, ROOT, REF_DIR).mayStageReference).toBe(true);
  });
  it('.alignment 폴더에서 git add test-review.json → 판단 기록을 담는다', () => {
    const dir = `${ROOT}/docs/conceptpowers/concepts/.alignment`;
    expect(stagingReach(`git add test-review.json && ${C}`, ROOT, dir).mayStageGovernance).toBe(
      true
    );
  });
  it('하위 폴더에서 ../ 경로도 루트 기준으로 정규화한다', () => {
    const dir = `${ROOT}/docs/conceptpowers/concepts`;
    expect(
      stagingReach(`git add -f ../reference/new.md && ${C}`, ROOT, dir).forcedReference
    ).toEqual([`${REF}/new.md`]);
  });
  it('작업 폴더를 모르면(null) 루트에서 출발한 것으로 본다 — 좁은 스테이징은 좁게 (H2)', () => {
    expect(stagingReach(`git add -f new.md && ${C}`, ROOT, null).forcedReference).toEqual([]);
    expect(stagingReach(`git add src/a.ts && ${C}`, ROOT, null).mayStageGovernance).toBe(false);
  });
  it('루트 밖이면 위치 불명 — 참고자료 폴더 전체로 기운다', () => {
    expect(stagingReach(`git add -f new.md && ${C}`, ROOT, '/elsewhere').forcedReference).toEqual([
      REF,
    ]);
  });
});

// 대소문자 무시 파일시스템에서는 대소문자만 다른 표기로 피하지 못한다 (B5)
// [규칙: 참고자료 기밀 확인은 어느 강도에서나 반드시 사람에게 묻는다]
describe.runIf(CASE_INSENSITIVE_FS)('stagingReach — 대소문자 무시 파일시스템', () => {
  it('Docs/Conceptpowers/Reference/x.md → 참고자료를 담는다', () => {
    expect(
      stagingReach(`git add Docs/Conceptpowers/Reference/x.md && ${C}`, ROOT).mayStageReference
    ).toBe(true);
  });
  it('강제 추가 표기의 대소문자가 다르면 참고자료 폴더 전체', () => {
    expect(
      stagingReach(`git add -f Docs/Conceptpowers/Reference/x.md && ${C}`, ROOT).forcedReference
    ).toEqual([REF]);
  });
  it('Docs/Conceptpowers/Init.json → 설정을 담는다', () => {
    expect(
      stagingReach(`git add Docs/Conceptpowers/Init.json && ${C}`, ROOT).mayStageGovernance
    ).toBe(true);
  });
});

// 결과를 문지기 질문 옵션으로 옮긴다 — 설정 파일을 직접 담는 명령인지(configExplicit) 함께
// [규칙: 거버넌스 설정 파일의 변경·삭제 … 가 커밋에 들어오면 강도와 무관하게 사람에게 묻는다]
describe('pendingOptionsFor.configExplicit', () => {
  const cases: [string, boolean][] = [
    [`git add -f docs/conceptpowers/init.json && ${C}`, true],
    [`git add docs/conceptpowers && ${C}`, true],
    [`git add docs && ${C}`, true],
    [`git add . && ${C}`, true],
    [`pnpm lint && git add -A && ${C}`, true],
    [`git add src/b.ts && ${C.replace('-m', '-am')}`, true],
    [`git add docs/conceptpowers/*.json && ${C}`, true],
    [`pnpm lint && ${C}`, false],
    [`git add src/b.ts && ${C}`, false],
    [`git add src/*.ts && ${C}`, false],
    [`git add -f ${REF}/new.md && ${C}`, false],
    // 경로 없는 넓은 스테이징은 위치·셸 확장과 무관하게 설정을 직접 담는다 (H3-a·b·c)
    [`cd "$P" && git add -A && ${C}`, true],
    [`cd "$(git rev-parse --show-toplevel)" && git add -A && ${C}`, true],
    [`git -C "$PWD" add -A && ${C}`, true],
    [`git -C ~/proj add -A && ${C}`, true],
    [`sh -c "git add -A && ${C}"`, true],
    [`git add -A $X && ${C}`, true],
    [`cd "$P" && git add . && ${C}`, true],
    // 위치를 모르는 곳에서 설정 경로 글자(또는 그 상위 폴더)를 담는 add (H3-e)
    [`source env.sh && git add docs/conceptpowers/init.json && ${C}`, true],
    [`cd "$D" && git add docs/conceptpowers/init.json && ${C}`, true],
    [`cd "$D" && git add docs/conceptpowers && ${C}`, true],
    [`git -C ~/x add docs/conceptpowers/init.json && ${C}`, true],
    // 다른 경로만 담거나 무엇을 할지 모르는 명령(별칭 — H3-d 기각)은 그대로 거짓
    [`cd "$D" && git add src/b.ts && ${C}`, false],
    [`source env.sh && git add src/b.ts && ${C}`, false],
    [`git aa && ${C}`, false],
  ];
  for (const [cmd, expected] of cases) {
    it(`${JSON.stringify(cmd).slice(0, 80)} → ${expected}`, () => {
      expect(pendingOptionsFor(cmd, ROOT).configExplicit ?? false).toBe(expected);
    });
  }
  it('나머지 필드는 stagingReach 결과 그대로', () => {
    const cmd = `git add -f ${REF}/new.md && ${C}`;
    const r = stagingReach(cmd, ROOT);
    expect(pendingOptionsFor(cmd, ROOT)).toMatchObject({
      includeWorktree: r.mayStageGovernance,
      referenceWorktree: r.mayStageReference,
      forcedReference: r.forcedReference,
    });
  });
});

// alias는 커밋 판정과 같은 풀이(gitAlias)로 읽는다 — 셸 alias 본문도 같은 방식으로 훑고(F3), 펼친 모양을 확정할 수
// 없으면(줄바꿈·여러 구간) 무엇이든 담을 수 있는 쪽으로 본다(F2)
// [규칙: 거버넌스 설정 파일의 변경·삭제 … 가 커밋에 들어오면 강도와 무관하게 사람에게 묻는다]
describe('stagingReach — 주입된 alias', () => {
  it("셸 alias '!git add -A'는 설정을 직접 담는다 (F3)", () => {
    const r = stagingReach(`git -c alias.s='!git add -A' s && ${C}`, ROOT);
    expect(r).toMatchObject({ mayStageGovernance: true, configExplicit: true });
  });
  it('셸 alias가 좁게 담으면 좁게 본다', () => {
    const r = stagingReach(`git -c alias.s='!git add src/a.ts' s && ${C}`, ROOT);
    expect(r.configExplicit).toBe(false);
  });
  it('줄바꿈이 든 alias 값은 판단 불가 — 무엇이든 담을 수 있다 (F2)', () => {
    const r = stagingReach(`git -c 'alias.st=add\n-A' st && ${C}`, ROOT);
    expect(r).toMatchObject({ mayStageGovernance: true, mayStageReference: true });
    const f = stagingReach(`git -c 'alias.st=add\n-f' st ${REF}/x.md && ${C}`, ROOT);
    expect(f.forcedReference).toEqual([REF]);
  });
  // G4-a: 일반 alias는 git처럼 공백·따옴표·역슬래시로만 나눈다 — 셸 연산자 글자는 낱말의 일부
  it('셸 연산자 글자가 든 alias 값도 git처럼 한 낱말로 읽는다', () => {
    const r = stagingReach(`git -c 'alias.st=add src/a.ts;true' st && ${C}`, ROOT);
    expect(r.mayStageGovernance).toBe(false);
  });
  it('git이 나눌 수 없는 alias 값(닫히지 않은 따옴표)은 판단 불가', () => {
    const r = stagingReach(`git -c 'alias.st=add "src/a.ts' st && ${C}`, ROOT);
    expect(r.mayStageGovernance).toBe(true);
  });
});

// 넓은 스테이징 옵션에 경로가 붙으면 설정을 직접 담는지는 그 경로로 가린다 — 위치 불명·셸 확장일 때만 넓게 (F6)
// [규칙: 거버넌스 설정 파일의 변경·삭제 … 가 커밋에 들어오면 강도와 무관하게 사람에게 묻는다]
describe('stagingReach.configExplicit — 넓은 옵션 + 경로', () => {
  const cases: [string, boolean][] = [
    [`git add -A src && ${C}`, false],
    [`git add -u src/ && ${C}`, false],
    [`git add -A -- src && ${C}`, false],
    [`git add -A docs && ${C}`, true],
    [`git add -A . && ${C}`, true],
    [`git add -A $X && ${C}`, true],
    [`cd "$D" && git add -A src && ${C}`, true],
  ];
  for (const [cmd, expected] of cases) {
    it(`${JSON.stringify(cmd).slice(0, 60)} → ${expected}`, () => {
      expect(stagingReach(cmd, ROOT).configExplicit).toBe(expected);
    });
  }
  it('넓은 옵션이면 담을 수 있는 범위(mayStage*)는 그대로 넓다', () => {
    expect(stagingReach(`git add -A src && ${C}`, ROOT).mayStageGovernance).toBe(true);
  });
});

// 위치는 절대경로로 따라간다 — 출발이 루트 밖이어도 절대경로 cd·-C는 다시 정해지고(F5), 다른 저장소의 스테이징은
// 이 프로젝트를 담지 않는다 [규칙: 문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다]
describe('stagingReach — 위치와 저장소', () => {
  it('밖에서 절대경로 cd로 루트에 와 좁게 담으면 좁게 본다 (F5)', () => {
    const r = stagingReach(`cd ${ROOT} && git add src/a.ts && ${C}`, ROOT, '/elsewhere');
    expect(r).toMatchObject({ mayStageGovernance: false, configExplicit: false });
    const c = stagingReach(`git -C ${ROOT} add -f ${REF}/n.md && ${C}`, ROOT, '/elsewhere');
    expect(c.forcedReference).toEqual([`${REF}/n.md`]);
  });
  it('git이 읽는 위치가 다른 저장소면 담지 않는다', () => {
    const relation = (dir: string) => (dir.startsWith('/other') ? 'other' : 'same') as const;
    const r = stagingReach(`git -C /other add -A && ${C}`, ROOT, ROOT, relation);
    expect(r).toEqual({
      mayStageGovernance: false,
      mayStageReference: false,
      forcedReference: [],
      configExplicit: false,
    });
  });
  // G2: 위치 따라가기는 커밋 판정과 같은 규칙(dirEffects) — 조건부 cd는 사슬이 끝나면 위치 불명, 파이프·백그라운드
  // cd는 위치를 바꾸지 않는다
  const otherRepo = (dir: string) => (dir.startsWith('/other') ? 'other' : 'same') as const;
  for (const cmd of [
    `false && cd /other; git add -A && ${C}`,
    `git diff --quiet || cd /other; git add -A && ${C}`,
    `if test -d /other; then cd /other; fi; git add -A && ${C}`,
    `cat x | cd /other; git add -A && ${C}`,
  ]) {
    it(`조건부·파이프 마지막 cd 뒤의 넓은 스테이징은 넓게 본다: ${cmd}`, () => {
      expect(stagingReach(cmd, ROOT, ROOT, otherRepo).configExplicit).toBe(true);
    });
  }
  for (const cmd of [`cd /other | cat; git add -A && ${C}`, `cd /other & git add -A && ${C}`]) {
    it(`다른 프로세스의 cd는 위치를 바꾸지 않는다: ${cmd}`, () => {
      expect(stagingReach(cmd, ROOT, ROOT, otherRepo).configExplicit).toBe(true);
    });
  }
  it('같은 사슬의 cd는 그대로 따라간다', () => {
    const r = stagingReach(`false && cd /other && git add -A && ${C}`, ROOT, ROOT, otherRepo);
    expect(r.configExplicit).toBe(false);
  });
  // G4-b: 명령 없는 GIT_* 지정도 뒤 git의 저장소·설정을 바꿀 수 있다(내보낸 변수) — 커밋 판정과 맞춘다
  it('명령 없는 저장소 환경 변수 지정 뒤의 스테이징은 위치를 모르는 것으로 본다', () => {
    const r = stagingReach(`GIT_DIR=/x/.git; git add -A && ${C}`, ROOT, '/other', otherRepo);
    expect(r.mayStageGovernance).toBe(true);
    const n = stagingReach(`GIT_WORK_TREE=/x; git -C /other add -A && ${C}`, ROOT, ROOT, otherRepo);
    expect(n.mayStageGovernance).toBe(true);
  });
  // G5: 위치를 바꾸는 래퍼 옵션 뒤의 git은 위치 불명
  it('sudo -D로 위치를 바꾼 스테이징은 넓게 본다', () => {
    const r = stagingReach(`sudo -D /x git add -A && ${C}`, ROOT, '/other', otherRepo);
    expect(
      stagingReach(`sudo git add -A && ${C}`, ROOT, '/other', otherRepo).mayStageGovernance
    ).toBe(false);
    expect(r.mayStageGovernance).toBe(true);
  });

  it('루트를 품는 위 폴더를 가리키면 넓게 본다', () => {
    expect(stagingReach(`git add .. && ${C}`, ROOT, `${ROOT}/src`).configExplicit).toBe(true);
    expect(stagingReach(`git add ../.. && ${C}`, ROOT, `${ROOT}/src`).configExplicit).toBe(true);
  });
});
