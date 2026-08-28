// @concept:viewer-readability
// tests/viewer/heroSummary.test.ts
// 상세 화면 제목 아래 요약과 허용·제한 카드(assets/viewer.js)의 표시를 node:vm + 최소 DOM 스텁으로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - 상위 기준 문서(펼쳐 읽는 자리) "제목 아래 요약이 두 가지 이상의 이야기를 담고 있으면,
//    각 이야기는 저마다 독립된 줄을 차지한다"
//    → 문장이 끝나는 자리마다 항목을 나눈다 / 여러 항목이면 목록으로 그린다 / 한 덩어리 문단으로 그리지 않는다
//  - viewer-readability 불변 "도구가 글을 끊어 보여줄 때 원래 글의 내용은 하나도 더해지거나 빠지지
//    않는다 — 나누는 자리만 정할 뿐이다" → 나뉜 항목을 도로 이으면 원문과 같다
//  - 상위 기준 문서(펼쳐 읽는 자리) "한 가지만 담긴 요약은 끊지 않고 그대로 한 줄로 보여준다"
//    → 문장이 하나뿐이면 나누지 않는다 / 항목이 하나면 문단(p)을 유지한다 / 빈 요약은 아무것도 그리지 않는다
//  - viewer-readability 허용 "긴 글을 뜻이 마무리되는 자리에서 나누어 이야기마다 줄을 바꿔 보여주는 것" (표식 붙이는 자리
//    앞에 표식을 붙이는 것" → 표식을 붙일 수 있도록 목록(ul.hero__points) 구조로 그린다
//  - viewer-readability 제한 "이름·번호·자릿수처럼 붙어 있어야 뜻이 통하는 표기를 끊는 자리로
//    오해해 도중에 자르는 것" → 파일 이름·판번호 안의 마침표는 끊는 자리가 아니다
//  - 상위 기준 문서(펼쳐 읽는 자리) "요약 아래로 이어지는 본문 각 절은 원래 글의 생김새를 그대로
//    따른다" → 허용·제한 카드는 항목이 있는 쪽만 그리고, 둘 다 비면 절 자체를 두지 않는다
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

function load() {
  const ctx: Record<string, unknown> = { window: {}, document: makeDocument() };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx as {
    summaryPoints: (text: unknown) => string[];
    heroSummary: (text: unknown) => StubNode | null;
    actionsSection: (t: unknown, actions: unknown) => StubNode | null;
  };
}

const T = { allow: '허용 행동', restrict: '제한 행동' };

describe('summaryPoints — 요약을 이야기 단위로 끊는다', () => {
  const { summaryPoints } = load();

  it('불변1: 문장이 끝나는 자리마다 항목을 나눈다', () => {
    expect(
      summaryPoints('목록은 훑는 곳이다. 이름표와 제목을 나눠 놓는다. 상태는 색으로만 표시한다.')
    ).toEqual(['목록은 훑는 곳이다.', '이름표와 제목을 나눠 놓는다.', '상태는 색으로만 표시한다.']);
  });

  it('불변2: 나뉜 항목을 도로 이으면 원문과 같다 — 더해지거나 빠진 말이 없다', () => {
    const text =
      '개념과 기능을 늘어놓는 자리에서는 두 가지를 보여준다 — 이름표와 제목. 이 둘을 이어 붙이지 않는다!';
    expect(summaryPoints(text).join(' ')).toBe(text);
  });

  it('불변3: 문장이 하나뿐이면 나누지 않는다', () => {
    expect(summaryPoints('첫 화면 검색창에 몇 글자만 넣으면 다 찾아준다.')).toEqual([
      '첫 화면 검색창에 몇 글자만 넣으면 다 찾아준다.',
    ]);
  });

  it('restrict3: 파일 이름 안의 마침표는 끊는 자리가 아니다', () => {
    expect(summaryPoints('원본은 assets/viewer.js 하나뿐이다. 나머지는 생성물이다.')).toEqual([
      '원본은 assets/viewer.js 하나뿐이다.',
      '나머지는 생성물이다.',
    ]);
  });

  it('restrict3: 판번호 안의 마침표도 끊는 자리가 아니다', () => {
    expect(summaryPoints('v1.5.1 부터 적용된다. 그 앞 판에서는 없던 규칙이다.')).toEqual([
      'v1.5.1 부터 적용된다.',
      '그 앞 판에서는 없던 규칙이다.',
    ]);
  });

  it('마침표 없이 끝나는 꼬리 글도 항목으로 남긴다', () => {
    expect(summaryPoints('앞 문장이다. 마침표 없는 꼬리')).toEqual([
      '앞 문장이다.',
      '마침표 없는 꼬리',
    ]);
  });

  it('빈 요약은 항목이 없다', () => {
    expect(summaryPoints('')).toEqual([]);
    expect(summaryPoints(null)).toEqual([]);
    expect(summaryPoints(undefined)).toEqual([]);
  });
});

describe('heroSummary — 제목 아래 요약을 그린다', () => {
  it('불변1 + allow2: 여러 항목이면 항목마다 줄을 나눈 목록으로 그린다', () => {
    const { heroSummary } = load();
    const node = heroSummary(
      '목록은 훑는 곳이다. 이름표와 제목을 나눠 놓는다. 상태는 색으로만 표시한다.'
    ) as StubNode;
    expect(node.tagName).toBe('ul');
    expect(node.getAttribute('class')).toBe('hero__points');
    const items = findAll(node, 'li');
    expect(items.map((li) => li.textContent)).toEqual([
      '목록은 훑는 곳이다.',
      '이름표와 제목을 나눠 놓는다.',
      '상태는 색으로만 표시한다.',
    ]);
  });

  it('restrict1: 여러 이야기를 한 덩어리 문단으로 그리지 않는다', () => {
    const { heroSummary } = load();
    const node = heroSummary('앞 이야기다. 뒤 이야기다.') as StubNode;
    expect(findAll(node, 'p')).toHaveLength(0);
  });

  it('불변3: 한 항목이면 문단 그대로 둔다', () => {
    const { heroSummary } = load();
    const node = heroSummary('첫 화면 검색창에 몇 글자만 넣으면 다 찾아준다.') as StubNode;
    expect(node.tagName).toBe('p');
    expect(node.textContent).toBe('첫 화면 검색창에 몇 글자만 넣으면 다 찾아준다.');
  });

  it('빈 요약은 아무것도 그리지 않는다', () => {
    const { heroSummary } = load();
    expect(heroSummary('')).toBeNull();
  });
});

// 검증 대상 규칙(viewer-readability 불변): "요약 아래로 이어지는 본문 각 절은 원래 글의
// 생김새를 그대로 따른다" → 원래 글에 항목이 없는 절은 화면에도 자리를 만들지 않는다.
// 중복을 걷어낸 뒤 허용이나 제한이 빈 개념이 생겼고, 빈 카드가 제목만 남긴 채 그려지면 안 된다.
describe('actionsSection — 허용·제한 카드', () => {
  it('둘 다 있으면 카드 두 장을 그린다', () => {
    const { actionsSection } = load();
    const node = actionsSection(T, { allow: ['하는 것'], restrict: ['안 하는 것'] }) as StubNode;
    const cards = findAll(node, 'div');
    expect(cards.map((d) => d.getAttribute('class'))).toEqual([
      'col-card col-card--allow',
      'col-card col-card--restrict',
    ]);
  });

  it('허용이 비면 제한 카드만 그린다', () => {
    const { actionsSection } = load();
    const node = actionsSection(T, { allow: [], restrict: ['안 하는 것'] }) as StubNode;
    const cards = findAll(node, 'div');
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute('class')).toBe('col-card col-card--restrict');
  });

  it('제한이 비면 허용 카드만 그린다', () => {
    const { actionsSection } = load();
    const node = actionsSection(T, { allow: ['하는 것'], restrict: [] }) as StubNode;
    const cards = findAll(node, 'div');
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute('class')).toBe('col-card col-card--allow');
  });

  it('둘 다 비면 절 자체를 그리지 않는다', () => {
    const { actionsSection } = load();
    expect(actionsSection(T, { allow: [], restrict: [] })).toBeNull();
  });

  it('항목이 아예 없는 개념에서도 터지지 않는다', () => {
    const { actionsSection } = load();
    expect(actionsSection(T, {})).toBeNull();
  });
});
