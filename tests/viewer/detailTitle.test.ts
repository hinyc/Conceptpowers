// @concept:viewer-readability
// tests/viewer/detailTitle.test.ts
// 펼쳐 본 화면의 제목 자리(assets/viewer.js)와 부제 항목의 부재를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - 상위 기준 문서(펼쳐 읽는 자리) "제목은 `이름표 | 이름` 한 줄로만 이루어진다"
//    → 제목 자리에 h1이 하나뿐이고 그 글자가 "이름표 | 이름"이다
//  - viewer-readability 허용 "이름이 비어 있거나 이름표와 똑같으면 이름표만 제목으로 보여주는 것"
//    → 이름이 이름표와 같으면 이름표만 / 이름이 비면 이름표만
//  - viewer-readability 불변 "항목의 이름은 은유적 부제 없이 그 자체로 무엇인지 알 수 있는 평이한
//    이름 하나로 적는다 — 부제를 담을 자리 자체를 두지 않는다"
//    → 저장 구조가 부제 값을 받아도 남기지 않는다 / 편집 화면 이름표 목록에 부제 항목이 없다
//  - viewer-readability 제한 "항목에 부제 자리를 만들어 이름 말고 또 다른 이름을 두는 것"
//    → 옛 기록에 부제가 실려 있어도 제목 자리 어디에도 그 글자가 나타나지 않는다
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { parseConcept } from '../../src/schema/concept.js';

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
  const text = (s: string): StubNode =>
    ({ tagName: '#text', attrs: {}, children: [], textContent: s }) as unknown as StubNode;
  return {
    createElementNS: (_ns: string, tag: string) => element(tag),
    createTextNode: (s: string) => text(s),
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

// 트리 전체의 노드를 모은다(어느 태그든). 부제 자리가 어디에도 없음을 보이는 데 쓴다.
function everyNode(node: StubNode): StubNode[] {
  const out: StubNode[] = [];
  const walk = (n: StubNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

const CONCEPT = {
  slug: 'settled-status',
  title: '상태 관리 원칙',
  status: 'green',
  category: ['behavior'],
  description: { definition: '한 번 확정되면 함부로 바뀌지 않는다.' },
};

function load() {
  const ctx: Record<string, unknown> = { window: {}, document: makeDocument() };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const state = ctx.state as { t: unknown };
  state.t = (ctx.I18N as Record<string, unknown>).ko;
  return ctx as Record<string, unknown> & {
    displayName: (title: string, slug: string) => string;
    conceptHero: (slug: string, c: unknown) => StubNode;
    I18N: Record<string, Record<string, string>>;
  };
}

describe('displayName — 이름표와 이름 하나로만', () => {
  const { displayName } = load();

  it('불변1: 이름이 이름표와 다르면 "이름표 | 이름" 한 줄로 만든다', () => {
    expect(displayName('영점 절차', 'rezero-procedure')).toBe('rezero-procedure | 영점 절차');
  });

  it('허용: 이름이 이름표와 똑같으면 이름표만 보여준다', () => {
    expect(displayName('plain-slug', 'plain-slug')).toBe('plain-slug');
  });

  it('허용: 이름이 비어 있으면 이름표만 보여준다', () => {
    expect(displayName('', 'rezero-procedure')).toBe('rezero-procedure');
  });
});

describe('conceptHero — 제목 자리', () => {
  it('불변1: 제목 자리에 h1이 하나뿐이고 "이름표 | 이름"이다', () => {
    const { conceptHero } = load();
    const hero = conceptHero('settled-status', CONCEPT);
    const h1s = findAll(hero, 'h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe('settled-status | 상태 관리 원칙');
  });

  it('제한: 옛 기록에 부제가 실려 있어도 제목 자리에 되살리지 않는다', () => {
    const { conceptHero } = load();
    const legacy = { ...CONCEPT, eyebrow: '개념 신호등' };
    const hero = conceptHero('settled-status', legacy);
    expect(hero.textContent).not.toContain('개념 신호등');
    // 글자 노드에는 속성이 없으므로 요소 노드만 본다.
    const classes = everyNode(hero).map((n) =>
      n.getAttribute ? n.getAttribute('class') || '' : ''
    );
    expect(classes.some((cls) => cls.indexOf('eyebrow') !== -1)).toBe(false);
  });
});

describe('부제 항목 자체가 없다', () => {
  it('불변2: 저장 구조는 부제 값을 받아도 남기지 않는다', () => {
    const parsed = parseConcept({
      slug: 'auth-token',
      category: ['behavior'],
      title: '토큰 발급',
      eyebrow: '되살아나면 안 되는 부제',
      description: { definition: '토큰을 발급한다' },
      purpose: { reason: '세션을 유지한다' },
      actions: { allow: ['발급'] },
      principle: { immutableRules: ['만료는 1시간'] },
    });
    expect(Object.prototype.hasOwnProperty.call(parsed, 'eyebrow')).toBe(false);
  });

  it('불변2: 편집 화면 이름표 목록에 부제 항목이 없다', () => {
    const { I18N } = load();
    expect(I18N.ko.eyebrow).toBeUndefined();
    expect(I18N.en.eyebrow).toBeUndefined();
  });
});
