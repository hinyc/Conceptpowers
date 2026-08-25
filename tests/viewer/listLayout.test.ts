// @concept:home-search @concept:viewer-readability @concept:feature-index-row
// tests/viewer/listLayout.test.ts
// 목록 표시(assets/viewer.js)의 표시명 형식과 레이아웃을 node:vm + 최소 DOM 스텁으로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - viewer-readability 불변 "세로로 나열되는 자리에서는 이름표와 제목이 각각 독립된 영역을 차지한다 —
//    한 줄 글자로 합치지 않는다" → 목록을 표로 그리고 코드·제목을 각각 다른 칸에 넣는다
//    → 사이드바는 표 대신 .group > li 구조로, 코드와 제목을 별도 줄로 나눈다
//  - viewer-readability 허용 "이름표와 제목 어느 쪽을 눌러도 같은 항목으로 이동하게 하는 것"
//    → 코드 칸·제목 칸의 href가 같은 개념을 가리킨다
//  - viewer-readability 제한 "목록의 각 항목에서 상태 동그라미 옆에 상태 이름을 글자로 덧붙이는 것"
//    → 상태 칸은 글자 없이 색 동그라미만 둔다(textContent가 빈 문자열)
//  - viewer-readability 불변 "상태 동그라미를 쓰는 화면에는 그 색이 무슨 뜻인지 알려주는 설명이 같은
//    화면 안에 있다" → 범례가 세 상태의 색과 뜻을 모두 설명한다
//  - viewer-readability 불변 "색을 못 보는 사람도 알 수 있도록, 상태 동그라미에는 상태 이름이 읽어줄 수
//    있는 형태로 붙어 있다" → 동그라미에 role=img와 aria-label을 단다
//  - home-search 불변 "첫 화면 찾기는 코드 파일 경로까지 찾아오고, 곁 목록 찾기는 이미 화면에
//    떠 있는 것만 좁힌다" → li의 textContent에 코드와 제목이 모두 남아 걸러내기가 둘 다로 동작한다
//  - home-search 정의 "첫 화면에서는 개념·기능·코드 파일을 새로 찾아오고, 곁 목록에서는 이미 떠 있는 것 중
//    안 맞는 것을 숨긴다"
//    → 검색 결과도 목록과 같은 표 구조로 그린다
//  - feature-index-row 불변 "기능 줄에는 그 기능이 따르는 개념이 하나도 빠짐없이 붙는다"
//    → 색인 줄에 따르는 개념이 모두 딱지로 붙는다
//  - feature-index-row 허용 "줄의 이름표를 눌러 그 기능에 초점을 맞춘 지식 그래프로 가는 것"
//    → 코드 칸의 이름표가 #/graph/<slug> 링크다 — 나가는 길은 딱지와 이름표뿐
//  - feature-index-row 허용 "개념 화면에서 … 목록의 그 줄로 돌아오고, 그 줄을 눈에 띄게 표시하는 것"
//    → 초점 대상 줄에 id와 강조 표시가 붙고, 색만이 아니라 읽어줄 수 있는 표시(aria-current)와
//      키보드 초점을 받을 수 있는 tabindex도 함께 붙는다
//    → 앵커 노릇은 색인 구역의 표만 한다 — 검색 결과 표에는 줄 id를 붙이지 않아 문서에
//      같은 id가 두 번 생기지 않는다
//  - feature-index-row 불변 "기능 하나만 펼쳐 보는 전용 화면은 만들지 않는다 …" → 곁 목록에는 기능이 들어오지 않는다
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../../assets/viewer.js'), 'utf8').replace(
  /\nboot\(\);?\s*$/,
  '\n'
);

// ---- 최소 DOM 스텁 (h()가 쓰는 createElementNS/createTextNode/appendChild/setAttribute만) ----
interface StubNode {
  tagName: string;
  attrs: Record<string, string>;
  children: StubNode[];
  readonly textContent: string;
  setAttribute(k: string, v: string): void;
  getAttribute(k: string): string | null;
  appendChild(c: StubNode): StubNode;
}

function makeDocument() {
  const element = (tag: string): StubNode => ({
    tagName: tag,
    attrs: {},
    children: [],
    get textContent(): string {
      return this.children.map((c) => c.textContent).join('');
    },
    setAttribute(k, v) {
      this.attrs[k] = String(v);
    },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
    },
    appendChild(c) {
      this.children.push(c);
      return c;
    },
  });
  const text = (s: string): StubNode =>
    ({ tagName: '#text', attrs: {}, children: [], textContent: s }) as unknown as StubNode;
  return {
    createElementNS: (_ns: string, tag: string) => element(tag),
    createTextNode: (s: string) => text(s),
  };
}

// 트리 전체에서 태그명이 일치하는 노드를 모은다.
function findAll(node: StubNode, tag: string): StubNode[] {
  const out: StubNode[] = [];
  const walk = (n: StubNode) => {
    if (n.tagName === tag) out.push(n);
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function byClass(nodes: StubNode[], cls: string): StubNode[] {
  return nodes.filter((n) => (n.getAttribute('class') || '').split(/\s+/).indexOf(cls) !== -1);
}

const MANIFEST = {
  concepts: [
    {
      slug: 'rezero-procedure',
      title: '영점 절차',
      group: 'core',
      category: ['behavior'],
      status: 'green',
    },
    { slug: 'plain-slug', title: 'plain-slug', group: 'core', category: [], status: 'red' },
  ],
  features: [
    {
      slug: 'viewer-search',
      title: '뷰어 검색',
      description: '개념·기능·코드 경로를 통합 검색한다.',
      concepts: ['rezero-procedure', 'plain-slug'],
    },
  ],
  graph: { edges: [] },
};

function load() {
  const ctx: Record<string, unknown> = { window: {}, document: makeDocument() };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const state = ctx.state as { manifest: unknown; t: unknown };
  state.manifest = MANIFEST;
  state.t = (ctx.I18N as Record<string, unknown>).ko;
  return ctx as Record<string, (...args: unknown[]) => StubNode>;
}

// 제목 문자열을 "이름표 | 이름" 한 줄로 만드는 규칙은 훑기와 읽기(viewer-readability)이
// 소유한다 — 검증은 tests/viewer/detailTitle.test.ts에 있다.

describe('목록 페이지 — 코드 열과 제목 열이 분리된 표', () => {
  it('개념 목록을 표로 그리고 코드·제목을 각각 다른 칸에 넣는다', () => {
    const ctx = load();
    const section = ctx.conceptListSections(null, false)[0] as unknown as StubNode;
    expect(findAll(section, 'table')).toHaveLength(1);
    const rows = findAll(section, 'tbody')[0].children;
    expect(rows).toHaveLength(2);
    const codeCell = byClass(findAll(rows[0], 'td'), 'ctable__code')[0];
    const titleCell = byClass(findAll(rows[0], 'td'), 'ctable__title')[0];
    expect(codeCell.textContent).toBe('rezero-procedure');
    expect(titleCell.textContent).toBe('영점 절차');
    // 코드·제목 어느 쪽을 눌러도 같은 개념으로 이동한다.
    expect(findAll(codeCell, 'a')[0].getAttribute('href')).toBe('#/concept/rezero-procedure');
    expect(findAll(titleCell, 'a')[0].getAttribute('href')).toBe('#/concept/rezero-procedure');
  });

  it('개념 표에 상태·코드·제목·분류 머리글을 둔다', () => {
    const ctx = load();
    const section = ctx.conceptListSections(null, false)[0] as unknown as StubNode;
    const headers = findAll(section, 'th').map((th) => th.textContent);
    expect(headers).toEqual(['상태', '코드', '제목', '분류']);
  });

  it('기능 색인 줄도 코드 열과 제목 열이 분리된 표로 그린다', () => {
    const ctx = load();
    const section = ctx.featureListSection(null) as unknown as StubNode;
    expect(findAll(section, 'table')).toHaveLength(1);
    const row = findAll(section, 'tbody')[0].children[0];
    expect(byClass(findAll(row, 'td'), 'ctable__code')[0].textContent).toBe('viewer-search');
    expect(byClass(findAll(row, 'td'), 'ctable__title')[0].textContent).toContain('뷰어 검색');
  });

  it('기능 색인 줄에는 따르는 개념이 모두 딱지로 붙는다', () => {
    const ctx = load();
    const section = ctx.featureListSection(null) as unknown as StubNode;
    const row = findAll(section, 'tbody')[0].children[0];
    const chips = byClass(findAll(row, 'a'), 'chip');
    expect(chips.map((a) => a.getAttribute('href'))).toEqual([
      '#/concept/rezero-procedure',
      '#/concept/plain-slug',
    ]);
    // 나가는 길은 딱지(개념)와 이름표(그래프)뿐 — 그 밖의 링크는 없다
    expect(findAll(row, 'a')).toHaveLength(chips.length + 1);
  });

  it('기능 줄의 이름표를 누르면 그 기능에 초점을 맞춘 지식 그래프로 간다', () => {
    const ctx = load();
    const section = ctx.featureListSection(null) as unknown as StubNode;
    const row = findAll(section, 'tbody')[0].children[0];
    const codeCell = byClass(findAll(row, 'td'), 'ctable__code')[0];
    expect(findAll(codeCell, 'a')[0].getAttribute('href')).toBe('#/graph/viewer-search');
  });

  it('개념 화면에서 넘어온 기능 줄은 눈에 띄게 표시된다', () => {
    const ctx = load();
    const section = ctx.featureListSection('viewer-search') as unknown as StubNode;
    const row = findAll(section, 'tbody')[0].children[0];
    expect(row.getAttribute('id')).toBe('frow-viewer-search');
    expect(row.getAttribute('class')).toBe('ctable__row--focus');
    // 색만으로는 전달되지 않는다 — 읽어줄 수 있는 표시와 키보드 초점 자리를 함께 둔다.
    expect(row.getAttribute('aria-current')).toBe('true');
    expect(row.getAttribute('tabindex')).toBe('-1');
  });

  it('색인 구역의 줄은 초점이 없어도 앵커 id를 갖는다', () => {
    const ctx = load();
    const section = ctx.featureListSection(null) as unknown as StubNode;
    const row = findAll(section, 'tbody')[0].children[0];
    expect(row.getAttribute('id')).toBe('frow-viewer-search');
  });

  it('검색 결과처럼 앵커가 아닌 기능 표에는 줄 id를 붙이지 않는다', () => {
    const ctx = load();
    const table = ctx.featureTable(MANIFEST.features) as unknown as StubNode;
    const row = findAll(table, 'tbody')[0].children[0];
    expect(row.getAttribute('id')).toBeNull();
  });
});

describe('상태 표시 — 글자 없는 동그라미 + 우측 상단 범례', () => {
  it('목록의 상태 칸은 글자 없이 상태색 동그라미만 둔다', () => {
    const ctx = load();
    const section = ctx.conceptListSections(null, false)[0] as unknown as StubNode;
    const cell = byClass(findAll(section, 'td'), 'ctable__status')[0];
    expect(cell.textContent).toBe('');
    const dot = findAll(cell, 'span')[0];
    expect(dot.getAttribute('class')).toBe('status-dot status-dot--green');
    // 색만으로는 뜻이 전달되지 않으므로 아이콘마다 레이블을 붙인다.
    expect(dot.getAttribute('aria-label')).toBe('승인됨');
    expect(dot.getAttribute('role')).toBe('img');
  });

  it('범례가 세 상태의 색과 뜻을 모두 설명한다', () => {
    const ctx = load();
    const legend = ctx.statusLegend() as unknown as StubNode;
    const items = byClass(findAll(legend, 'span'), 'status-legend__item');
    expect(items.map((i) => i.textContent)).toEqual(['승인됨', '보류', '미승인']);
    expect(
      items.map((i) => byClass(findAll(i, 'span'), 'status-dot')[0].getAttribute('class'))
    ).toEqual([
      'status-dot status-dot--green',
      'status-dot status-dot--pending',
      'status-dot status-dot--red',
    ]);
  });
});

describe('사이드바 — 코드·제목 2줄 스택 (home-search 필터 호환)', () => {
  it('사이드바는 표가 아니라 .group > li 구조를 유지한다', () => {
    const ctx = load();
    const section = ctx.conceptListSections(
      { kind: 'concept', slug: 'rezero-procedure' },
      true
    )[0] as unknown as StubNode;
    expect(findAll(section, 'table')).toHaveLength(0);
    expect(findAll(section, 'li')).toHaveLength(2);
    expect(section.getAttribute('class')).toBe('group');
  });

  it('li의 텍스트에 코드와 제목이 모두 남아 걸러내기가 둘 다로 동작한다', () => {
    const ctx = load();
    const section = ctx.conceptListSections(null, true)[0] as unknown as StubNode;
    const text = findAll(section, 'li')[0].textContent;
    expect(text).toContain('rezero-procedure');
    expect(text).toContain('영점 절차');
  });

  it('코드와 제목을 별도 줄(요소)로 나눠 인라인 병기를 없앤다', () => {
    const ctx = load();
    const section = ctx.conceptListSections(null, true)[0] as unknown as StubNode;
    const li = findAll(section, 'li')[0];
    expect(byClass(findAll(li, 'span'), 'side-item__code')[0].textContent).toBe('rezero-procedure');
    expect(byClass(findAll(li, 'span'), 'side-item__title')[0].textContent).toBe('영점 절차');
  });

  it('제목이 코드와 같으면 제목 줄을 만들지 않는다', () => {
    const ctx = load();
    const section = ctx.conceptListSections(null, true)[0] as unknown as StubNode;
    const li = findAll(section, 'li')[1];
    expect(byClass(findAll(li, 'span'), 'side-item__title')).toHaveLength(0);
  });

  it('곁 목록에는 기능이 들어오지 않는다 — 개념 묶음만 담는다', () => {
    const ctx = load();
    const sections = ctx.conceptListSections(null, true) as unknown as StubNode[];
    const links = sections.flatMap((s) => findAll(s, 'a')).map((a) => a.getAttribute('href'));
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((href) => (href || '').indexOf('#/feature/') !== 0)).toBe(true);
  });
});
