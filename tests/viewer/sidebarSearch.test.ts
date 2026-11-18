// @concept:list-filter @concept:viewer-navigation @concept:viewer-readability
// tests/viewer/sidebarSearch.test.ts
// 곁 목록 검색 칸(assets/sidebar.js CPSidebar.shell)을 node:vm + DOM 스텁으로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - list-filter 불변 "글자를 넣는 동안 곁 목록은 모든 묶음의 개념으로 넓어지고 그 안에서 걸러낸다 —
//    개념이 아닌 기능·파일 경로는 데려오지 않는다"
//    → 입력이 비면 지금 묶음만 보인다 / 글자를 넣으면 다른 묶음의 개념도 묶음별로 나온다 /
//      기능 이름·파일 경로만 맞는 말은 아무것도 안 나온다 / 별칭만 맞는 말도 안 나온다
//  - list-filter 불변 "대소문자를 가리지 않고, 입력한 말이 일부만 맞아도 남는다"
//    → 대문자·부분 일치
//  - list-filter 허용 "한 묶음의 항목이 전부 안 맞으면 그 묶음 제목까지 함께 숨기는 것" → 안 맞는 묶음 숨김,
//    아무것도 안 맞으면 결과 없음 안내
//  - list-filter 불변 "입력한 말을 지우면 숨겼던 항목과 묶음을 모두 원래대로 되돌린다"
//    → 지우기·Esc로 지금 묶음 목록으로 복귀, 이어서 다시 넣어도 이전 결과가 남지 않는다
//  - list-filter 불변 "다른 항목으로 이동하면 좁히기 입력은 빈 상태로 초기화된다" → shell()이 새로 만든 입력은 비어 있다
//  - list-filter 제한 "입력한 말을 다음 방문까지 저장해 두는 것" → localStorage에 쓰지 않는다
//  - list-filter 허용 "숨기는 동안 보고 있던 화면은 그대로 두는 것" → 본문 노드는 손대지 않는다 / 현재 개념 강조 유지
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { makeDocument, everyNode, byClass, fire, visible, type StubNode } from './domStub.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (n: string) => readFileSync(join(here, '../../assets', n), 'utf8');
const viewerSrc = read('viewer.js').replace(/\nboot\(\);?\s*$/, '\n');

const MANIFEST = {
  concepts: [
    { slug: 'a-one', title: '첫째 Alpha', group: 'alpha', category: ['feature'], status: 'green' },
    {
      slug: 'a-two',
      title: '둘째',
      group: 'alpha',
      category: [],
      status: 'pending',
      aliases: ['별명씀'],
    },
    { slug: 'b-one', title: 'Beta Thing', group: 'beta', category: [], status: 'red' },
    { slug: 'c-one', title: '셋째', group: 'gamma', category: [], status: 'green' },
  ],
  features: [
    {
      slug: 'feat-x',
      title: '기능 엑스',
      description: '',
      concepts: ['a-one'],
      files: ['src/zzfile.ts'],
    },
  ],
  graph: { edges: [] },
};

function setup() {
  const stored: Record<string, string> = {};
  const win = {
    localStorage: {
      getItem: (k: string) => stored[k] ?? null,
      setItem: (k: string, v: string) => {
        stored[k] = v;
      },
    },
  };
  const doc = makeDocument();
  const ctx: Record<string, unknown> = { window: win, document: doc };
  vm.createContext(ctx);
  vm.runInContext(viewerSrc, ctx);
  vm.runInContext(read('topnav.js'), ctx);
  vm.runInContext(read('sidebar.js'), ctx);
  const c = ctx as unknown as {
    state: { manifest: unknown; t: unknown };
    CPSidebar: { shell(slug: string, wrap: StubNode): StubNode };
    h(tag: string, attrs: unknown, ch?: unknown): StubNode;
  };
  c.state.manifest = MANIFEST;
  c.state.t = (ctx.I18N as Record<string, unknown>).ko;
  const wrap = c.h('div', { class: 'wrap' }, 'body');
  const shell = c.CPSidebar.shell('a-one', wrap);
  const search = byClass(shell, 'side-search')[0];
  const current = byClass(shell, 'side__current')[0];
  const all = byClass(shell, 'side__all')[0];
  const noResults = byClass(shell, 'side-noresults')[0];
  const type = (v: string) => {
    search.value = v;
    fire(search, 'input');
  };
  const shownSlugs = (root: StubNode) =>
    root
      .querySelectorAll('li')
      .filter(visible)
      .map((li) => byClass(li, 'side-item__code')[0].textContent);
  const shownGroups = (root: StubNode) =>
    root
      .querySelectorAll('.group')
      .filter(visible)
      .map((g) => g.querySelectorAll('h2')[0].textContent);
  const reopen = (slug: string) => c.CPSidebar.shell(slug, wrap);
  return {
    reopen,
    stored,
    shell,
    wrap,
    search,
    current,
    all,
    noResults,
    type,
    shownSlugs,
    shownGroups,
  };
}

describe('곁 목록 검색 (list-filter)', () => {
  it('입력이 비면 지금 묶음만 보이고 모든 묶음 목록은 가려져 있다', () => {
    const s = setup();
    expect(visible(s.current)).toBe(true);
    expect(visible(s.all)).toBe(false);
    expect(s.shownGroups(s.current)).toEqual(['alpha']);
    expect(s.shownSlugs(s.current)).toEqual(['a-one', 'a-two']);
  });

  it('글자를 넣으면 다른 묶음의 개념도 묶음별로 나온다', () => {
    const s = setup();
    s.type('one');
    expect(visible(s.current)).toBe(false);
    expect(visible(s.all)).toBe(true);
    expect(s.shownGroups(s.all)).toEqual(['alpha', 'beta', 'gamma']);
    expect(s.shownSlugs(s.all)).toEqual(['a-one', 'b-one', 'c-one']);
  });

  it('대소문자를 가리지 않고 일부만 맞아도 남는다', () => {
    const s = setup();
    s.type('BETA');
    expect(s.shownSlugs(s.all)).toEqual(['b-one']);
    s.type('hin');
    expect(s.shownSlugs(s.all)).toEqual(['b-one']);
  });

  it('안 맞는 묶음은 제목까지 숨긴다', () => {
    const s = setup();
    s.type('beta');
    expect(s.shownGroups(s.all)).toEqual(['beta']);
  });

  it('기능 이름·파일 경로·별칭만 맞는 말은 아무것도 나오지 않고 결과 없음 안내가 뜬다', () => {
    const s = setup();
    for (const q of ['기능 엑스', 'zzfile', 'feat-x', '별명씀']) {
      s.type(q);
      expect(s.shownSlugs(s.all)).toEqual([]);
      expect(s.shownGroups(s.all)).toEqual([]);
      expect(visible(s.noResults)).toBe(true);
    }
  });

  it('지우면 지금 묶음 목록으로 돌아오고 결과 없음 안내가 사라진다', () => {
    const s = setup();
    s.type('zzzz');
    s.type('');
    expect(visible(s.current)).toBe(true);
    expect(visible(s.all)).toBe(false);
    expect(visible(s.noResults)).toBe(false);
    expect(s.shownSlugs(s.current)).toEqual(['a-one', 'a-two']);
  });

  it('Esc로 지우면 같은 방식으로 돌아온다', () => {
    const s = setup();
    s.type('beta');
    fire(s.search, 'keydown', { key: 'Escape' });
    expect(s.search.value).toBe('');
    expect(visible(s.current)).toBe(true);
    expect(visible(s.all)).toBe(false);
  });

  it('지운 뒤 다시 넣어도 이전 결과가 남지 않는다', () => {
    const s = setup();
    s.type('beta');
    s.type('');
    s.type('셋째');
    expect(s.shownSlugs(s.all)).toEqual(['c-one']);
  });

  it('다른 개념으로 이동하면(shell 새로 만들기) 입력은 빈 상태다', () => {
    const s = setup();
    s.type('beta');
    const next = s.reopen('b-one');
    const search = byClass(next, 'side-search')[0];
    expect(search.value).toBe('');
    expect(visible(byClass(next, 'side__current')[0])).toBe(true);
    expect(visible(byClass(next, 'side__all')[0])).toBe(false);
  });

  it('현재 개념 강조가 두 목록 모두에 남는다', () => {
    const s = setup();
    const activeIn = (root: StubNode) =>
      root
        .querySelectorAll('li')
        .filter((li) => (li.attrs.class || '').includes('active'))
        .map((li) => byClass(li, 'side-item__code')[0].textContent);
    expect(activeIn(s.current)).toEqual(['a-one']);
    expect(activeIn(s.all)).toEqual(['a-one']);
  });

  it('입력을 저장하지 않고 본문은 그대로다', () => {
    const s = setup();
    s.type('beta');
    expect(Object.keys(s.stored).some((k) => k.includes('search') || k.includes('filter'))).toBe(
      false
    );
    expect(s.wrap.textContent).toBe('body');
    expect(everyNode(s.shell).includes(s.wrap)).toBe(true);
  });

  it('항목 링크는 기존 이동 방식(해시 링크) 그대로다', () => {
    const s = setup();
    const hrefs = s.all
      .querySelectorAll('a')
      .map((a) => a.getAttribute('href'))
      .sort();
    expect(hrefs).toEqual([
      '#/concept/a-one',
      '#/concept/a-two',
      '#/concept/b-one',
      '#/concept/c-one',
    ]);
  });
});
