// @concept:viewer-navigation
// tests/viewer/topnav.test.ts
// 상단 묶음 메뉴(assets/topnav.js)를 node:vm + 최소 DOM 스텁으로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - 상위 기준 문서(화면 사이 이동) "묶음 줄: 화면 위쪽에 항상 있는, 묶음 이름들이 나열된 한 줄"
//    → 개념 묶음마다 버튼 하나
//  - feature-spec-bridge 불변 "기능은 자기만 펼쳐 보는 전용 자리를 갖지 않는다 — 훑는 자리의 한 줄과 지식 지도의 점으로만 나타난다"
//    → 기능은 묶음 줄에도 펼침 목록에도 들어오지 않는다
//  - 상위 기준 문서(화면 사이 이동) "현재 위치 표시: 지금 보고 있는 항목이 속한 묶음을 눈에 띄게 표시한다"
//    → 보고 있는 항목의 묶음에 active 표시
//  - 상위 기준 문서(화면 사이 이동) "마우스·터치·키보드 어느 입력으로도 펼침 목록을 열고 닫을 수 있다"
//    → button 요소 + click/mouseenter 바인딩
//  - 상위 기준 문서(화면 사이 이동) "펼침 목록 안의 항목도 훑는 자리 표기를 그대로 따른다"
//    → 펼침 목록 항목은 상태 동그라미 + 나뉜 이름표·제목으로 그린다
//  - viewer-readability 불변 "상태를 색으로 알리는 자리에는 그 색이 무슨 뜻인지 알려주는 설명이 같은
//    화면 안에 있다" → 펼침 목록 안에 범례를 둔다
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const viewerSrc = readFileSync(join(here, '../../assets/viewer.js'), 'utf8').replace(
  /\nboot\(\);?\s*$/,
  '\n'
);
const topnavSrc = readFileSync(join(here, '../../assets/topnav.js'), 'utf8');

// ---- 최소 DOM 스텁 (listLayout.test.ts와 같은 패턴 + addEventListener/classList) ----
interface StubNode {
  tagName: string;
  attrs: Record<string, string>;
  children: StubNode[];
  listeners: Record<string, Array<() => void>>;
  readonly textContent: string;
  setAttribute(k: string, v: string): void;
  getAttribute(k: string): string | null;
  appendChild(c: StubNode): StubNode;
  addEventListener(ev: string, fn: () => void): void;
}

function makeDocument() {
  const element = (tag: string): StubNode => ({
    tagName: tag,
    attrs: {},
    children: [],
    listeners: {},
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
    addEventListener(ev, fn) {
      (this.listeners[ev] = this.listeners[ev] || []).push(fn);
    },
  });
  const text = (s: string): StubNode =>
    ({ tagName: '#text', attrs: {}, children: [], listeners: {}, textContent: s }) as StubNode;
  return {
    createElementNS: (_ns: string, tag: string) => element(tag),
    createTextNode: (s: string) => text(s),
    addEventListener: () => {},
  };
}

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
    { slug: 'a-one', title: '첫째', group: 'alpha', category: [], status: 'green' },
    { slug: 'a-two', title: '둘째', group: 'alpha', category: [], status: 'pending' },
    { slug: 'b-one', title: 'b-one', group: 'beta', category: [], status: 'red' },
  ],
  features: [{ slug: 'feat-x', title: '기능 엑스', description: '설명', concepts: ['a-one'] }],
  graph: { edges: [] },
};

type Ctx = Record<string, unknown> & {
  CPTopnav: {
    bar(active: { kind: string; slug: string } | null): StubNode | null;
    groupsOf(m: unknown): Array<{ key: string; items: Array<{ kind: string; slug: string }> }>;
    activeGroupKey(m: unknown, a: { kind: string; slug: string } | null): string | null;
    isMenuOpen(): boolean;
  };
};

function load(): Ctx {
  const ctx: Record<string, unknown> = { window: {}, document: makeDocument() };
  vm.createContext(ctx);
  vm.runInContext(viewerSrc, ctx);
  vm.runInContext(topnavSrc, ctx);
  const state = ctx.state as { manifest: unknown; t: unknown };
  state.manifest = MANIFEST;
  state.t = (ctx.I18N as Record<string, unknown>).ko;
  return ctx as Ctx;
}

describe('CPTopnav.groupsOf — 묶음 나열(개념 묶음 순서대로)', () => {
  it('개념을 묶음별로 모은다', () => {
    const { CPTopnav } = load();
    const groups = CPTopnav.groupsOf(MANIFEST);
    expect(groups.map((g) => g.key)).toEqual(['alpha', 'beta']);
    expect(groups[0].items.map((i) => i.slug)).toEqual(['a-one', 'a-two']);
  });

  it('기능이 있어도 기능 묶음은 만들지 않는다', () => {
    const { CPTopnav } = load();
    expect(MANIFEST.features.length).toBeGreaterThan(0);
    const groups = CPTopnav.groupsOf(MANIFEST);
    expect(groups.some((g) => g.key === '__features')).toBe(false);
  });
});

describe('CPTopnav.activeGroupKey — 현재 위치의 묶음', () => {
  it('개념이면 그 개념이 속한 묶음이다', () => {
    const { CPTopnav } = load();
    expect(CPTopnav.activeGroupKey(MANIFEST, { kind: 'concept', slug: 'b-one' })).toBe('beta');
  });
  it('기능은 묶음을 갖지 않는다', () => {
    const { CPTopnav } = load();
    expect(CPTopnav.activeGroupKey(MANIFEST, { kind: 'feature', slug: 'feat-x' })).toBe(null);
  });
  it('없는 항목·미지정이면 null이다', () => {
    const { CPTopnav } = load();
    expect(CPTopnav.activeGroupKey(MANIFEST, { kind: 'concept', slug: 'nope' })).toBe(null);
    expect(CPTopnav.activeGroupKey(MANIFEST, null)).toBe(null);
  });
});

describe('CPTopnav.bar — 묶음 줄과 펼침 목록 (규칙: 묶음 줄 나열 · 현재 위치 표시)', () => {
  it('개념 묶음마다 버튼 하나씩 그린다', () => {
    const ctx = load();
    const bar = ctx.CPTopnav.bar(null)!;
    const buttons = byClass(findAll(bar, 'button'), 'topnav__btn');
    expect(buttons.map((b) => b.textContent)).toEqual(['alpha', 'beta']);
  });

  it('보고 있는 항목의 묶음에 active 표시를 한다', () => {
    const ctx = load();
    const bar = ctx.CPTopnav.bar({ kind: 'concept', slug: 'b-one' })!;
    const active = byClass(findAll(bar, 'div'), 'topnav__item--active');
    expect(active).toHaveLength(1);
    expect(byClass(findAll(active[0], 'button'), 'topnav__btn')[0].textContent).toBe('beta');
  });

  it('버튼은 펼침 상태를 알리는 표식(aria-expanded/haspopup)을 갖고 click·mouseenter로 연다', () => {
    const ctx = load();
    const bar = ctx.CPTopnav.bar(null)!;
    const btn = byClass(findAll(bar, 'button'), 'topnav__btn')[0];
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-haspopup')).toBe('true');
    expect(btn.listeners.click).toBeTruthy(); // 누름(터치)·키보드(버튼 요소의 Enter/Space)
    const item = byClass(findAll(bar, 'div'), 'topnav__item')[0];
    expect(item.listeners.mouseenter).toBeTruthy(); // 마우스 올림
    expect(item.listeners.mouseleave).toBeTruthy();
  });

  it('개념이 하나도 없으면 아무것도 그리지 않는다', () => {
    const ctx = load();
    (ctx.state as { manifest: unknown }).manifest = { concepts: [], features: [] };
    expect(ctx.CPTopnav.bar(null)).toBe(null);
  });
});

describe('펼침 목록 항목 — viewer-readability 준수', () => {
  it('개념 항목은 상태 동그라미 + 나뉜 이름표·제목으로 그린다', () => {
    const ctx = load();
    const bar = ctx.CPTopnav.bar(null)!;
    const panel = byClass(findAll(bar, 'div'), 'topnav__panel')[0];
    const li = findAll(panel, 'li')[0];
    expect(byClass(findAll(li, 'span'), 'status-dot')).toHaveLength(1);
    expect(byClass(findAll(li, 'span'), 'side-item__code')[0].textContent).toBe('a-one');
    expect(byClass(findAll(li, 'span'), 'side-item__title')[0].textContent).toBe('첫째');
    expect(findAll(li, 'a')[0].getAttribute('href')).toBe('#/concept/a-one');
  });

  it('개념 펼침 목록 안에 동그라미 색 뜻을 알려주는 범례가 있다', () => {
    const ctx = load();
    const bar = ctx.CPTopnav.bar(null)!;
    const panel = byClass(findAll(bar, 'div'), 'topnav__panel')[0];
    const legend = byClass(findAll(panel, 'div'), 'status-legend');
    expect(legend).toHaveLength(1);
  });

  it('펼침 목록 어디에도 기능 항목은 없다', () => {
    const ctx = load();
    const bar = ctx.CPTopnav.bar(null)!;
    const links = findAll(bar, 'a').map((a) => a.getAttribute('href'));
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((href) => (href || '').indexOf('#/feature/') !== 0)).toBe(true);
  });

  it('항목을 고르면 닫히도록 li에 click을 바인딩한다 (규칙: 고르면 닫힌다)', () => {
    const ctx = load();
    const bar = ctx.CPTopnav.bar(null)!;
    const panel = byClass(findAll(bar, 'div'), 'topnav__panel')[0];
    expect(findAll(panel, 'li')[0].listeners.click).toBeTruthy();
  });
});
