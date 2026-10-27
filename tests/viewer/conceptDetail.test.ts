// @concept:viewer-readability @concept:feature-spec-bridge @concept:settled-status
// tests/viewer/conceptDetail.test.ts
// 개념 상세 화면의 곁 목록 범례·관련 기능 줄·상태 전이 단추(assets/viewer.js, assets/sidebar.js)를
// node:vm + 최소 DOM 스텁으로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - viewer-readability 불변 "상태를 색으로 알리는 자리에는 그 색이 무슨 뜻인지 알려주는 설명이 같은
//    화면 안에 있다" → 상세 화면 곁 목록(상태 동그라미가 있는 자리) 안에 색 범례를 둔다
//  - feature-spec-bridge 불변 "기능이 나타나는 줄에는 그 기능이 따르는 개념이 하나도 빠짐없이 함께
//    드러난다" → 개념 상세의 "관련 기능" 줄마다 그 기능의 개념 딱지가 전부 붙는다
//  - settled-status 불변 "한 번 확정된 초록·빨강은 시스템 경로로는 되돌리지 않는다"
//    → 상태 단추는 서버가 보낸 전이표(state.transitions)로만 켜고 끈다 — 뷰어에 손 복사한 표가 없다
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
const sidebarSrc = readFileSync(join(here, '../../assets/sidebar.js'), 'utf8');

interface StubNode {
  tagName: string;
  attrs: Record<string, string>;
  children: StubNode[];
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
    addEventListener() {},
  });
  const text = (s: string): StubNode =>
    ({ tagName: '#text', attrs: {}, children: [], textContent: s }) as unknown as StubNode;
  return {
    createElementNS: (_ns: string, tag: string) => element(tag),
    createTextNode: (s: string) => text(s),
    addEventListener: () => {},
  };
}

function everyNode(node: StubNode): StubNode[] {
  const out: StubNode[] = [];
  const walk = (n: StubNode) => {
    out.push(n);
    (n.children || []).forEach(walk);
  };
  walk(node);
  return out;
}

function byClass(node: StubNode, cls: string): StubNode[] {
  return everyNode(node).filter(
    (n) => n.getAttribute && (n.getAttribute('class') || '').split(/\s+/).indexOf(cls) !== -1
  );
}

const MANIFEST = {
  concepts: [
    { slug: 'a-one', title: '첫째', group: 'alpha', category: [], status: 'green' },
    { slug: 'a-two', title: '둘째', group: 'alpha', category: [], status: 'pending' },
    { slug: 'loose', title: '묶음 없음', group: '', category: [], status: 'red' },
  ],
  features: [{ slug: 'feat-x', title: '기능 엑스', description: '', concepts: ['a-one', 'a-two'] }],
  graph: { edges: [] },
};

type Ctx = Record<string, unknown> & {
  state: { manifest: unknown; t: Record<string, string>; transitions: unknown };
  CPSidebar: { shell(slug: string, wrap: StubNode): StubNode };
  relatedFeaturesSection(features: unknown[]): StubNode | null;
  relatedFeatures(slug: string): unknown[];
  statusControl(slug: string, c: { status: string }): StubNode;
  statusLabel(status: string): string;
  h(tag: string, attrs: unknown, children?: unknown): StubNode;
};

function load(): Ctx {
  const ctx: Record<string, unknown> = {
    window: { localStorage: { getItem: () => null, setItem: () => {} } },
    document: makeDocument(),
  };
  vm.createContext(ctx);
  vm.runInContext(viewerSrc, ctx);
  vm.runInContext(topnavSrc, ctx);
  vm.runInContext(sidebarSrc, ctx);
  const c = ctx as Ctx;
  c.state.manifest = MANIFEST;
  c.state.t = (ctx.I18N as Record<string, Record<string, string>>).ko;
  return c;
}

describe('상세 화면 곁 목록의 상태 색 범례 (viewer-readability)', () => {
  it('상태 동그라미가 있는 곁 목록 안에 색 범례가 함께 있다', () => {
    const ctx = load();
    const shell = ctx.CPSidebar.shell('a-one', ctx.h('div', null));
    const side = everyNode(shell).find((n) => n.tagName === 'aside') as StubNode;
    expect(byClass(side, 'status-dot').length).toBeGreaterThan(0);
    const legends = byClass(side, 'status-legend');
    expect(legends).toHaveLength(1);
    for (const status of ['green', 'pending', 'red']) {
      expect(legends[0].textContent).toContain(ctx.statusLabel(status));
    }
  });
});

describe('관련 기능 줄의 개념 딱지 (feature-spec-bridge)', () => {
  it('관련 기능 줄마다 그 기능이 따르는 개념 딱지가 빠짐없이 붙는다', () => {
    const ctx = load();
    const section = ctx.relatedFeaturesSection(ctx.relatedFeatures('a-one')) as StubNode;
    const rows = everyNode(section).filter((n) => n.tagName === 'li');
    expect(rows).toHaveLength(1);
    const chips = byClass(rows[0], 'chip').map((n) => n.getAttribute('href'));
    expect(chips).toEqual(['#/concept/a-one', '#/concept/a-two']);
  });

  it('관련 기능이 없으면 구역을 만들지 않는다', () => {
    expect(load().relatedFeaturesSection([])).toBeNull();
  });
});

describe('상태 단추는 서버가 보낸 전이표를 따른다 (settled-status)', () => {
  const enabled = (ctrl: StubNode) =>
    everyNode(ctrl)
      .filter((n) => n.tagName === 'button' && n.getAttribute('disabled') === null)
      .map((n) => n.textContent);

  it('뷰어에는 손으로 베낀 전이표가 없다', () => {
    expect(viewerSrc).not.toMatch(/ALLOWED_TRANSITIONS\s*=/);
  });

  it('전이표에 있는 상태(자기 자신 제외)만 단추가 켜진다', () => {
    const ctx = load();
    ctx.state.transitions = {
      red: ['red', 'green'],
      pending: ['pending', 'green', 'red'],
      green: ['green'],
    };
    const t = ctx.state.t;
    expect(enabled(ctx.statusControl('x', { status: 'pending' }))).toEqual([
      t.statusGreen,
      t.statusRed,
    ]);
    expect(enabled(ctx.statusControl('x', { status: 'red' }))).toEqual([t.statusGreen]);
    expect(enabled(ctx.statusControl('x', { status: 'green' }))).toEqual([]);
  });

  it('전이표를 받지 못했으면 어떤 단추도 켜지 않는다(안전한 쪽)', () => {
    const ctx = load();
    ctx.state.transitions = null;
    expect(enabled(ctx.statusControl('x', { status: 'pending' }))).toEqual([]);
  });
});
