// @concept:knowledge-graph-view @concept:globally-unique-slug
// tests/viewer/subgraph.test.ts
// 초점 보기(subgraphFor)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - knowledge-graph-view 불변 "초점을 맞추면 그 개념과 이어지지 않은 점과 선은 화면에서 감춘다"
//    → 포커스 개념과 그 개념에 걸린 코드 파일만 남긴다
//    → 남은 노드 양끝을 모두 가진 엣지만 보존한다 (한쪽이 감춰진 선은 남기지 않는다)
//    → 연결이 전혀 없는 개념은 자기 노드 하나만 남는다
//  - globally-unique-slug 불변(이름표 유일) → 초점 대상은 이름표로만 지정한다
// 브라우저 SPA(assets/viewer.js)의 순수 함수 subgraphFor를 node:vm으로 로드해 검증한다.
// 최상위는 함수/변수 선언만 하므로(boot()는 index.html이 호출) DOM 없이 안전히 평가된다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildGraphData } from '../../src/viewer/graph.js';
import type { Concept } from '../../src/schema/concept.js';

const here = dirname(fileURLToPath(import.meta.url));
// 최상위 boot() 호출만 제거하면(SPA 진입점, 브라우저에서 index.html이 호출) DOM/네트워크 없이 평가된다.
// 세미콜론은 포매터(prettier) 설정에 따라 붙거나 빠지므로 둘 다 허용한다.
const src = readFileSync(join(here, '../../assets/viewer.js'), 'utf8').replace(
  /\nboot\(\);?\s*$/,
  '\n'
);

// sloppy 모드 스크립트의 최상위 function 선언은 컨텍스트 객체의 속성이 된다.
const ctx: Record<string, unknown> = { window: {}, document: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const subgraphFor = ctx.subgraphFor as (
  data: ReturnType<typeof buildGraphData>,
  slug: string
) => ReturnType<typeof buildGraphData>;

const concept = (slug: string, codeLinks: string[] = []): Concept =>
  ({
    slug,
    group: '',
    category: ['feature'],
    title: slug.toUpperCase(),
    eyebrow: '',
    status: 'red',
    description: { definition: 'd', analogy: '', components: [], example: '' },
    purpose: { reason: 'r', benefits: [], vision: '', painPoints: [] },
    actions: { allow: [], restrict: [], interaction: '' },
    principle: { immutableRules: [], tradeoffs: '', lifecycle: [] },
    relations: { prev: '', next: '', related: [] },
    codeLinks,
  }) as Concept;

describe('viewer subgraphFor', () => {
  // a는 코드 x를 직접 가리키고 표식으로 z가 더 붙는다. b는 코드 y만 가리킨다.
  const full = buildGraphData([concept('a', ['src/x.ts']), concept('b', ['src/y.ts'])], {
    a: ['src/z.ts'],
  });

  it('포커스 개념과 그 개념에 걸린 코드 파일만 남긴다', () => {
    const sub = subgraphFor(full, 'a');
    const ids = new Set(sub.nodes.map((n) => n.id));
    expect(ids).toEqual(new Set(['c:a', 'p:src/x.ts', 'p:src/z.ts']));
    // 무관한 개념 b와 그 코드는 빠진다
    expect(ids.has('c:b')).toBe(false);
    expect(ids.has('p:src/y.ts')).toBe(false);
  });

  it('남은 노드 양끝을 모두 가진 엣지만 보존한다', () => {
    const sub = subgraphFor(full, 'a');
    expect(sub.edges.length).toBe(2);
    for (const e of sub.edges) {
      expect(e.kind).toBe('concept-file');
      expect(sub.nodes.some((n) => n.id === e.source)).toBe(true);
      expect(sub.nodes.some((n) => n.id === e.target)).toBe(true);
    }
  });

  it('연결이 전혀 없는 개념은 자기 노드 하나만 남는다', () => {
    const isolated = buildGraphData([concept('lonely')]);
    const sub = subgraphFor(isolated, 'lonely');
    expect(sub.nodes.map((n) => n.id)).toEqual(['c:lonely']);
    expect(sub.edges).toEqual([]);
  });
});
