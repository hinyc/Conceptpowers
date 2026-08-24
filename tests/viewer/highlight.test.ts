// @concept:knowledge-graph-view
// tests/viewer/highlight.test.ts
// 점 클릭 강조(neighborIds)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - knowledge-graph-view 불변 "점을 누르면 그 점과 바로 이어진 이웃을 함께 도드라지게 표시하고,
//    갈 화면이 있는 점이면 바로가기 단추를 보여준다"
//    → 누른 점 자신과 선으로 바로 이어진 이웃만 강조 집합에 담는다 (방향 무관)
//    → 두 다리 건너의 점은 담지 않는다
//    → 이어진 선이 없는 점은 자기 자신만 담는다
// 브라우저 SPA(assets/viewer.js)의 순수 함수 neighborIds를 node:vm으로 로드해 검증한다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildGraphData } from '../../src/viewer/graph.js';
import type { Concept } from '../../src/schema/concept.js';
import type { Feature } from '../../src/schema/feature.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../../assets/viewer.js'), 'utf8').replace(
  /\nboot\(\);?\s*$/,
  '\n'
);

const ctx: Record<string, unknown> = { window: {}, document: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const neighborIds = ctx.neighborIds as (
  data: ReturnType<typeof buildGraphData>,
  id: string
) => Record<string, boolean>;

const concept = (slug: string, codeLinks: string[] = []): Concept =>
  ({
    slug,
    group: '',
    category: ['feature'],
    title: slug.toUpperCase(),
    status: 'red',
    description: { definition: 'd', analogy: '', components: [], example: '' },
    purpose: { reason: 'r', benefits: [], vision: '', painPoints: [] },
    actions: { allow: [], restrict: [], interaction: '' },
    principle: { immutableRules: [], tradeoffs: '', lifecycle: [] },
    relations: { prev: '', next: '', related: [] },
    codeLinks,
  }) as Concept;

const feature = (slug: string, concepts: string[]): Feature => ({
  slug,
  group: '',
  title: slug.toUpperCase(),
  description: '',
  concepts,
  codePaths: [],
});

describe('viewer neighborIds', () => {
  // login→a→x.ts, login→b→y.ts. a를 누르면 login·a·x.ts만 강조, y.ts와 b는 빠진다.
  const full = buildGraphData([concept('a', ['src/x.ts']), concept('b', ['src/y.ts'])], {}, [
    feature('login', ['a', 'b']),
  ]);

  it('누른 점 자신과 바로 이어진 이웃만 담는다 (방향 무관)', () => {
    const hl = neighborIds(full, 'c:a');
    expect(Object.keys(hl).sort()).toEqual(['c:a', 'f:login', 'p:src/x.ts']);
  });

  it('두 다리 건너의 점은 담지 않는다', () => {
    const hl = neighborIds(full, 'f:login');
    expect(hl['f:login']).toBe(true);
    expect(hl['c:a']).toBe(true);
    expect(hl['c:b']).toBe(true);
    expect(hl['p:src/x.ts']).toBeUndefined();
    expect(hl['p:src/y.ts']).toBeUndefined();
  });

  it('이어진 선이 없는 점은 자기 자신만 담는다', () => {
    const lonely = buildGraphData([concept('lonely')]);
    const hl = neighborIds(lonely, 'c:lonely');
    expect(Object.keys(hl)).toEqual(['c:lonely']);
  });
});
