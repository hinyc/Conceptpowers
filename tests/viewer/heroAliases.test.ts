// @concept:globally-unique-slug
// tests/viewer/heroAliases.test.ts
// 상세 화면 제목 아래 별칭 줄(assets/viewer.js conceptHero)을 node:vm + 최소 DOM 스텁으로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - globally-unique-slug 허용 "별칭이 있는 개념의 상세 화면에서, 정식 이름 아래에 그 별칭들을
//    별칭이라고 밝힌 채 보여주는 것" → 별칭이 있으면 "별칭 : 오징어, 바나나" 줄이 나온다
//  - globally-unique-slug 불변 "별칭은 정식 이름보다 뒤에, 별칭이라고 밝힌 채로만 보여준다 —
//    정식 이름 자리를 대신하지 않는다" → 별칭 줄은 제목(h1)보다 뒤에 오고, 제목 글자는
//    정식 이름 그대로다
//  - globally-unique-slug 불변 "별칭이 하나도 없는 개념에는 별칭 자리를 아예 만들지 않는다"
//    → 별칭이 없으면 줄 자체가 없다 (빈 "별칭 :" 도 남지 않는다)
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
  return {
    createElementNS: (_ns: string, tag: string) => element(tag),
    createElement: (tag: string) => element(tag),
    createTextNode: (text: string) =>
      ({ tagName: '#text', attrs: {}, children: [], textContent: text }) as unknown as StubNode,
  };
}

const concept = (aliases: string[]) => ({
  slug: 'product-line',
  title: '제품군',
  status: 'green',
  category: ['term'],
  aliases,
  description: { definition: '사업부 아래의 모델 묶음' },
});

function hero(aliases: string[]): StubNode {
  const ctx: Record<string, unknown> = { window: {}, document: makeDocument() };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const state = ctx.state as { t: unknown };
  state.t = (ctx.I18N as Record<string, unknown>).ko;
  const fn = ctx.conceptHero as (slug: string, c: unknown) => StubNode;
  return fn('product-line', concept(aliases));
}

// 별칭 줄만 골라낸다 — 없으면 undefined.
const aliasRow = (node: StubNode): StubNode | undefined =>
  node.children.find((c) => (c.getAttribute('class') || '').indexOf('aliases') !== -1);

describe('상세 화면 제목 아래 별칭 줄', () => {
  it('별칭이 있으면 별칭이라고 밝힌 채 쉼표로 이어 보여준다', () => {
    const row = aliasRow(hero(['오징어', '바나나']));
    expect(row).toBeDefined();
    expect(row!.textContent).toBe('별칭 : 오징어, 바나나');
  });

  it('별칭 줄은 정식 이름보다 뒤에 오고 제목을 대신하지 않는다', () => {
    const node = hero(['오징어']);
    const kinds = node.children.map((c) => c.tagName);
    const titleAt = kinds.indexOf('h1');
    const aliasAt = node.children.findIndex(
      (c) => (c.getAttribute('class') || '').indexOf('aliases') !== -1
    );
    expect(titleAt).toBeGreaterThanOrEqual(0);
    expect(aliasAt).toBeGreaterThan(titleAt);
    expect(node.children[titleAt].textContent).toBe('product-line | 제품군');
  });

  it('별칭이 하나도 없으면 별칭 자리를 아예 만들지 않는다', () => {
    const node = hero([]);
    expect(aliasRow(node)).toBeUndefined();
    expect(node.textContent).not.toContain('별칭');
  });

  it('aliases 항목 자체가 없는 옛 기록에도 별칭 자리를 만들지 않는다', () => {
    const ctx: Record<string, unknown> = { window: {}, document: makeDocument() };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    (ctx.state as { t: unknown }).t = (ctx.I18N as Record<string, unknown>).ko;
    const fn = ctx.conceptHero as (slug: string, c: unknown) => StubNode;
    const node = fn('product-line', {
      slug: 'product-line',
      title: '제품군',
      status: 'green',
      category: ['term'],
      description: { definition: 'd' },
    });
    expect(aliasRow(node)).toBeUndefined();
  });
});
