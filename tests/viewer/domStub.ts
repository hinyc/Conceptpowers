// @concept:list-filter @concept:pending-diff
// tests/viewer/domStub.ts — 뷰어 자산(assets/*.js)을 node:vm에서 돌리기 위한 최소 DOM 스텁(테스트 전용).
// h()가 쓰는 createElementNS/createTextNode, 곁 목록 걸러내기가 쓰는 style·querySelectorAll·이벤트를 지원한다.

export interface StubNode {
  tagName: string;
  attrs: Record<string, string>;
  children: StubNode[];
  style: Record<string, string>;
  value: string;
  listeners: Record<string, Array<(ev: unknown) => void>>;
  textContent: string;
  setAttribute(k: string, v: string): void;
  getAttribute(k: string): string | null;
  appendChild(c: StubNode): StubNode;
  addEventListener(ev: string, fn: (ev: unknown) => void): void;
  querySelectorAll(sel: string): StubNode[];
  querySelector(sel: string): StubNode | null;
  classList: { contains(c: string): boolean; toggle(c: string, on: boolean): void };
  closest(sel: string): StubNode | null;
}

function hasClass(n: StubNode, cls: string): boolean {
  return (n.attrs.class || '').split(/\s+/).includes(cls);
}

function matches(n: StubNode, sel: string): boolean {
  return sel.startsWith('.') ? hasClass(n, sel.slice(1)) : n.tagName === sel;
}

export function everyNode(node: StubNode): StubNode[] {
  const out: StubNode[] = [];
  const walk = (n: StubNode) => {
    out.push(n);
    (n.children || []).forEach(walk);
  };
  walk(node);
  return out;
}

export const byClass = (node: StubNode, cls: string): StubNode[] =>
  everyNode(node).filter((n) => n.attrs && hasClass(n, cls));

function parseStyle(style: Record<string, string>, text: string): void {
  for (const part of text.split(';')) {
    const [k, v] = part.split(':');
    if (k && v !== undefined) style[k.trim()] = v.trim();
  }
}

function element(tag: string): StubNode {
  const node: StubNode = {
    tagName: tag,
    attrs: {},
    children: [],
    style: {},
    value: '',
    listeners: {},
    get textContent(): string {
      return this.children.map((c) => c.textContent).join('');
    },
    set textContent(v: string) {
      // 브라우저처럼: 자식을 모두 비우고, 값이 있으면 글자 하나로 바꾼다.
      this.children = v ? [text(v)] : [];
    },
    setAttribute(k, v) {
      this.attrs[k] = String(v);
      if (k === 'style') parseStyle(this.style, String(v));
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
    querySelectorAll(sel) {
      return everyNode(this)
        .slice(1)
        .filter((n) => matches(n, sel));
    },
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] ?? null;
    },
    classList: {
      contains: (c) => hasClass(node, c),
      toggle: () => {},
    },
    closest: () => null,
  };
  return node;
}

function text(s: string): StubNode {
  return { tagName: '#text', attrs: {}, children: [], textContent: s } as unknown as StubNode;
}

export function makeDocument() {
  const app = element('div');
  return {
    app,
    createElementNS: (_ns: string, tag: string) => element(tag),
    createTextNode: (s: string) => text(s),
    addEventListener: () => {},
    getElementById: (id: string) => (id === 'app' ? app : null),
    body: { className: '' },
    documentElement: { lang: '' },
  };
}

export function fire(node: StubNode, ev: string, payload: Record<string, unknown> = {}): void {
  const event = { key: '', stopPropagation: () => {}, ...payload };
  for (const fn of node.listeners[ev] || []) fn(event);
}

export function visible(n: StubNode): boolean {
  return n.style.display !== 'none';
}
