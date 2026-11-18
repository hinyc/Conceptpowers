// @concept:pending-diff
// tests/viewer/conceptDiff.test.ts
// assets/conceptDiff.js(CPConceptDiff.diffConcepts)를 node:vm으로 로드해 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - pending-diff 허용 "항목마다 추가·삭제·수정을 구분해 보여주는 것"
//    → 글 칸: 없음→있음 추가 / 있음→없음 삭제 / 값이 다르면 수정(전·후)
//    → 배열 칸: 같은 항목을 먼저 짝지은 뒤 남은 것 중 비슷한 문장은 수정(전·후), 전혀 다른 것은 삭제+추가 /
//      유사도 짝짓기는 높은 쌍부터·같으면 원래 순서·한 항목 한 번 / 객체 배열도 같다
//    → 중복은 개수까지 센다 / 순서만 바뀌면 그 칸 하나가 수정(순서 변경)
//  - pending-diff 제한 "비교하면서 개념 내용이나 상태를 바꾸는 것" → 입력 객체를 바꾸지 않는다
//  - pending-diff 불변 "달라진 것이 없다고 말하지 않는다"의 바탕: 같으면 빈 목록, status만 다르면 빈 목록
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../../assets/conceptDiff.js'), 'utf8');

interface Change {
  field: string;
  kind: 'added' | 'removed' | 'changed';
  before: string | string[] | null;
  after: string | string[] | null;
  reordered: boolean;
}
type Diff = (a: unknown, b: unknown) => Change[];

function load(): Diff {
  const ctx: Record<string, unknown> = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return (ctx.CPConceptDiff as { diffConcepts: Diff }).diffConcepts;
}
const diff = load();

const base = () => ({
  slug: 'x',
  title: '제목',
  status: 'green',
  aliases: ['a'],
  category: ['feature'],
  description: { definition: '정의', components: ['c1', 'c2'] },
  purpose: { reason: '이유', benefits: ['b1'] },
  actions: { allow: ['ok'], restrict: ['no'] },
  principle: { immutableRules: ['r1', 'r2'], operationalPrinciple: '원리' },
  relations: { prev: '', next: '', related: ['p'] },
  codeLinks: ['src/a.ts'],
  sources: [{ kind: 'code', path: 'a.ts', locator: 'f()', supports: 's' }],
});

describe('diffConcepts', () => {
  it('같으면 빈 목록이다', () => {
    expect(diff(base(), base())).toEqual([]);
  });

  it('status만 다르면 빈 목록이다 (비교에서 status 제외)', () => {
    expect(diff(base(), { ...base(), status: 'pending' })).toEqual([]);
  });

  it('글 칸: 없음→있음은 추가', () => {
    const cur = base();
    (cur.description as Record<string, unknown>).analogy = '비유';
    expect(diff(base(), cur)).toEqual([
      {
        field: 'description.analogy',
        kind: 'added',
        before: null,
        after: '비유',
        reordered: false,
      },
    ]);
  });

  it('글 칸: 있음→없음은 삭제', () => {
    const cur = base();
    cur.principle.operationalPrinciple = '';
    expect(diff(base(), cur)).toEqual([
      {
        field: 'principle.operationalPrinciple',
        kind: 'removed',
        before: '원리',
        after: null,
        reordered: false,
      },
    ]);
  });

  it('글 칸: 값이 다르면 수정이고 전·후를 모두 담는다', () => {
    expect(diff(base(), { ...base(), title: '새 제목' })).toEqual([
      { field: 'title', kind: 'changed', before: '제목', after: '새 제목', reordered: false },
    ]);
  });

  it('배열 칸: 문장을 조금 고친 항목은 수정 1건(전·후)이다', () => {
    const cur = base();
    cur.actions.restrict = ['no 와 같은 금지'];
    const b = { ...base(), actions: { allow: ['ok'], restrict: ['no 와 다른 금지'] } };
    expect(diff(b, cur)).toEqual([
      {
        field: 'actions.restrict',
        kind: 'changed',
        before: 'no 와 다른 금지',
        after: 'no 와 같은 금지',
        reordered: false,
      },
    ]);
  });

  it('한글 문장 수정도 수정으로 짝짓는다 / 전혀 다른 문장 교체는 삭제+추가', () => {
    const b = {
      ...base(),
      actions: { allow: [], restrict: ['개념이 아닌 기능·파일 경로까지 찾아오는 것'] },
    };
    const near = {
      ...base(),
      actions: { allow: [], restrict: ['개념이 아닌 기능·파일 경로까지 데려오는 것'] },
    };
    const far = { ...base(), actions: { allow: [], restrict: ['입력한 말을 저장해 두는 것'] } };
    expect(diff(b, near).map((d) => d.kind)).toEqual(['changed']);
    expect(
      diff(b, far)
        .map((d) => d.kind)
        .sort()
    ).toEqual(['added', 'removed']);
  });

  it('유사도 기준(0.5)의 근거: 한두 단어 고침은 0.5를 넘고 무관한 문장은 한참 못 미친다', () => {
    const one = (x: string, y: string) =>
      diff({ actions: { restrict: [x] } }, { actions: { restrict: [y] } }).map((d) => d.kind);
    expect(one('파일을 읽을 수 없으면 알린다', '파일을 읽을 수 없으면 사유를 알린다')).toEqual([
      'changed',
    ]);
    expect(one('abcdef', 'abcxyz')).toEqual(['removed', 'added']); // Dice 0.2
  });

  it('여러 건을 동시에 고쳐도 올바른 짝끼리 수정이 된다', () => {
    const b = {
      actions: { restrict: ['사과를 먹는 것은 금지한다', '바나나를 먹는 것은 금지한다'] },
    };
    const a = {
      actions: { restrict: ['바나나를 먹는 것은 매우 금지한다', '사과를 먹는 것은 매우 금지한다'] },
    };
    const out = diff(b, a);
    expect(out).toHaveLength(2);
    expect(out.every((d) => d.kind === 'changed')).toBe(true);
    for (const d of out) {
      const fruit = (d.before as string).slice(0, 2);
      expect((d.after as string).startsWith(fruit)).toBe(true);
    }
  });

  it('한 항목은 한 번만 짝이 된다 — 남는 것은 삭제/추가', () => {
    const b = { actions: { restrict: ['같은 문장을 조금 고친다', '같은 문장을 조금 고친다 둘'] } };
    const a = { actions: { restrict: ['같은 문장을 조금 고친다 셋'] } };
    const kinds = diff(b, a)
      .map((d) => d.kind)
      .sort();
    expect(kinds).toEqual(['changed', 'removed']);
  });

  it('결정적이다 — 같은 입력은 항상 같은 결과이고 동점이면 원래 순서가 먼저다', () => {
    const b = { actions: { restrict: ['가나다라마바 사', '가나다라마바 아'] } };
    const a = { actions: { restrict: ['가나다라마바 자'] } };
    const first = JSON.stringify(diff(b, a));
    for (let i = 0; i < 5; i++) expect(JSON.stringify(diff(b, a))).toBe(first);
    const out = diff(b, a);
    expect(out[0]).toMatchObject({ kind: 'changed', before: '가나다라마바 사' });
  });

  it('전혀 다른 문장으로 바뀌면 삭제+추가로 남는다', () => {
    const cur = base();
    cur.actions.restrict = ['zzzzzz'];
    const out = diff(base(), cur);
    expect(out.map((d) => d.kind).sort()).toEqual(['added', 'removed']);
  });

  it('객체 배열(근거): 키 순서가 달라도 같은 값으로 짝짓고, 바뀐 것은 삭제+추가', () => {
    const cur = base();
    cur.sources = [
      { supports: 's', locator: 'f()', path: 'a.ts', kind: 'code' },
      { kind: 'decision', path: '', locator: 'L', supports: 'n' },
    ];
    const out = diff(base(), cur);
    expect(out).toEqual([
      {
        field: 'sources',
        kind: 'added',
        before: null,
        after: 'decision |  | L | n',
        reordered: false,
      },
    ]);
  });

  it('객체 항목(근거)의 일부 값을 고치면 읽기 쉬운 한 줄 전·후로 수정이 된다', () => {
    const cur = base();
    cur.sources = [{ kind: 'code', path: 'a.ts', locator: 'f(), g()', supports: 's' }];
    expect(diff(base(), cur)).toEqual([
      {
        field: 'sources',
        kind: 'changed',
        before: 'code | a.ts | f() | s',
        after: 'code | a.ts | f(), g() | s',
        reordered: false,
      },
    ]);
  });

  it('중복은 개수까지 센다', () => {
    const before = { ...base(), aliases: ['a', 'a'] };
    const after = { ...base(), aliases: ['a'] };
    expect(diff(before, after)).toEqual([
      { field: 'aliases', kind: 'removed', before: 'a', after: null, reordered: false },
    ]);
    expect(diff(after, before)).toEqual([
      { field: 'aliases', kind: 'added', before: null, after: 'a', reordered: false },
    ]);
  });

  it('내용은 같고 순서만 다르면 그 칸이 수정(순서 변경)이고 전·후 배열을 담는다', () => {
    const cur = base();
    cur.principle.immutableRules = ['r2', 'r1'];
    expect(diff(base(), cur)).toEqual([
      {
        field: 'principle.immutableRules',
        kind: 'changed',
        before: ['r1', 'r2'],
        after: ['r2', 'r1'],
        reordered: true,
      },
    ]);
  });

  it('칸이 통째로 없던 배열에 항목이 생기면 추가', () => {
    const before = base() as Record<string, unknown>;
    delete before.codeLinks;
    expect(diff(before, base())).toEqual([
      { field: 'codeLinks', kind: 'added', before: null, after: 'src/a.ts', reordered: false },
    ]);
  });

  it('입력을 바꾸지 않는다', () => {
    const a = base();
    const b = { ...base(), title: 'z' };
    const snapA = JSON.stringify(a);
    const snapB = JSON.stringify(b);
    diff(a, b);
    expect(JSON.stringify(a)).toBe(snapA);
    expect(JSON.stringify(b)).toBe(snapB);
  });
});
