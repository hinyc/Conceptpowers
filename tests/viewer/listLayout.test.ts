// @concept:home-search @concept:sidebar-search
// tests/viewer/listLayout.test.ts
// 목록 표시(assets/viewer.js)의 표시명 형식과 레이아웃을 node:vm + 최소 DOM 스텁으로 검증한다.
// 검증 대상 규칙:
//  - sidebar-search "화면에 그려진 글자만 보고 걸러낸다" → 사이드바 li의 textContent에
//    코드(slug)와 제목이 모두 남아 있어야 필터가 기존대로 동작한다.
//  - home-search "개념·기능을 한 번의 입력으로 함께 찾는다" → 검색 결과도 목록과 같은 표 구조.
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
  features: [{ slug: 'home-search', title: '한 곳에서 다 찾기', codePathCount: 2 }],
  graph: { edges: [] },
};

function load() {
  const ctx: Record<string, unknown> = { window: {}, document: makeDocument() };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const state = ctx.state as { manifest: unknown; t: unknown };
  state.manifest = MANIFEST;
  state.t = (ctx.I18N as Record<string, unknown>).ko;
  return ctx as Record<string, (...args: unknown[]) => StubNode> & {
    displayName: (title: string, slug: string) => string;
  };
}

describe('viewer displayName — 코드 | 제목', () => {
  const { displayName } = load();

  it('제목이 코드와 다르면 "코드 | 제목"으로 병기한다', () => {
    expect(displayName('영점 절차', 'rezero-procedure')).toBe('rezero-procedure | 영점 절차');
  });

  it('제목이 코드와 같으면 코드만 보여준다', () => {
    expect(displayName('plain-slug', 'plain-slug')).toBe('plain-slug');
  });

  it('제목이 비어 있으면 코드만 보여준다', () => {
    expect(displayName('', 'rezero-procedure')).toBe('rezero-procedure');
  });
});

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

  it('기능 목록도 코드 열과 제목 열이 분리된 표로 그린다', () => {
    const ctx = load();
    const section = ctx.featureListSection(null, false) as unknown as StubNode;
    expect(findAll(section, 'table')).toHaveLength(1);
    const row = findAll(section, 'tbody')[0].children[0];
    expect(byClass(findAll(row, 'td'), 'ctable__code')[0].textContent).toBe('home-search');
    expect(byClass(findAll(row, 'td'), 'ctable__title')[0].textContent).toBe('한 곳에서 다 찾기');
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

describe('사이드바 — 코드·제목 2줄 스택 (sidebar-search 필터 호환)', () => {
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

  it('기능 목록도 사이드바에서는 li 구조를 유지한다', () => {
    const ctx = load();
    const section = ctx.featureListSection(null, true) as unknown as StubNode;
    expect(findAll(section, 'table')).toHaveLength(0);
    expect(findAll(section, 'li')).toHaveLength(1);
  });
});
