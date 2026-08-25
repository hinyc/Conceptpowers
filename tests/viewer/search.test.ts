// @concept:concept-aliases @concept:home-search
// tests/viewer/search.test.ts
// 첫 화면 찾기(assets/viewer.js searchData)를 node:vm으로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - concept-aliases 불변 "별칭으로 찾아도 이름표로 찾은 것과 같은 개념에 닿는다"
//    → 별칭으로 친 검색어가 그 개념을 결과에 올린다
//  - concept-aliases 허용 "별칭으로 찾아온 결과를 그 개념의 정식 이름으로 보여주는 것"
//    → 결과에 실려 오는 것은 별칭이 아니라 그 개념 자체다(이름표·정식 이름 그대로)
//  - concept-aliases 불변 "별칭이 하나도 없는 것이 정상이다 — 별칭은 혼용이 있을 때만 생기고,
//    정리되면 사라진다" → 별칭이 없는 개념도 이름표·제목으로 그대로 찾힌다
//  - home-search 불변 "대소문자를 가리지 않고, 검색어가 일부만 맞아도 걸린다"
//    → 별칭도 같은 규칙으로 걸린다
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

const MANIFEST = {
  concepts: [
    {
      slug: 'product-line',
      title: '제품군',
      group: 'domain',
      category: ['term'],
      status: 'green',
      aliases: ['부서', 'Department'],
    },
    {
      slug: 'plain-concept',
      title: '별칭 없는 개념',
      group: 'domain',
      category: ['term'],
      status: 'green',
      aliases: [],
    },
  ],
  features: [],
  graph: { nodes: [], edges: [] },
};

interface SearchResult {
  concepts: { slug: string; title: string }[];
}

function load() {
  const ctx: Record<string, unknown> = { window: {}, document: { createElementNS: () => ({}) } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  (ctx.state as { manifest: unknown }).manifest = MANIFEST;
  return ctx.searchData as (q: string) => SearchResult;
}

describe('첫 화면 찾기 — 별칭', () => {
  it('별칭으로 찾아도 이름표로 찾은 것과 같은 개념에 닿는다', () => {
    const searchData = load();
    const bySlug = searchData('product-line').concepts.map((c) => c.slug);
    const byAlias = searchData('부서').concepts.map((c) => c.slug);
    expect(bySlug).toContain('product-line');
    expect(byAlias).toEqual(bySlug);
  });

  it('별칭으로 찾아와도 결과에는 그 개념의 정식 이름이 실린다', () => {
    const hit = load()('부서').concepts[0];
    expect(hit.title).toBe('제품군');
    expect(hit.slug).toBe('product-line');
  });

  it('별칭도 대소문자를 가리지 않고 일부만 맞아도 걸린다', () => {
    const searchData = load();
    expect(searchData('depart').concepts.map((c) => c.slug)).toContain('product-line');
    expect(searchData('DEPARTMENT').concepts.map((c) => c.slug)).toContain('product-line');
  });

  it('별칭이 없는 개념도 이름표와 제목으로 그대로 찾힌다 (별칭 없음이 정상)', () => {
    const searchData = load();
    expect(searchData('plain-concept').concepts.map((c) => c.slug)).toEqual(['plain-concept']);
    expect(searchData('별칭 없는').concepts.map((c) => c.slug)).toEqual(['plain-concept']);
  });

  it('어느 개념의 별칭도 아닌 말은 걸리지 않는다', () => {
    expect(load()('존재하지않는말').concepts).toEqual([]);
  });
});
