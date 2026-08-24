// @concept:knowledge-graph-view @concept:feature-index-row @concept:globally-unique-slug
// tests/viewer/graph.test.ts
// 지식 그래프 데이터(buildGraphData)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - knowledge-graph-view 구성요소 "점 두 종류: 개념, 코드 파일 / 선: 점과 점 사이의 연결"
//    → 개념·파일 노드와 개념→파일 엣지만 만든다
//  - feature-index-row 불변 "기능은 목록의 줄로만 보여주고, 기능 하나만 펼쳐 보는 화면은 만들지 않는다"
//    → 그래프에는 기능 점도 기능에서 나가는 선도 없다
//  - concept-code-mapping 정의 "개념 하나가 어느 파일들에 구현돼 있는지는, 코드에 붙은 표식을 거꾸로
//    모아 알아낸다" → mapping(@concept→파일)도 개념→파일로 연결한다 / 개념의 codeLinks도 같은 엣지가 된다
//  - globally-unique-slug 허용 "묶음 구조와 무관하게 이름표만으로 개념이나 기능을 찾아가는 것"
//    → 노드 href는 이름표를 쓴 SPA 해시 라우트를 가리킨다
//    → 여러 개념이 같은 파일을 가리키면 파일 노드는 하나로 합쳐진다 (같은 경로는 같은 점이다)
import { describe, it, expect } from 'vitest';
import { buildGraphData } from '../../src/viewer/graph.js';
import type { Concept } from '../../src/schema/concept.js';

const concept = (slug: string, group = ''): Concept =>
  ({
    slug,
    group,
    category: ['feature'],
    title: slug.toUpperCase(),
    eyebrow: '',
    status: 'red',
    description: { definition: 'd', analogy: '', components: [], example: '' },
    purpose: { reason: 'r', benefits: [], vision: '', painPoints: [] },
    actions: { allow: [], restrict: [], interaction: '' },
    principle: { immutableRules: [], tradeoffs: '', lifecycle: [] },
    relations: { prev: '', next: '', related: [] },
    codeLinks: [],
  }) as Concept;

describe('buildGraphData', () => {
  it('개념·파일 노드와 개념→파일 엣지를 만든다', () => {
    const c = { ...concept('auth'), codeLinks: ['src/login.ts'] } as Concept;
    const g = buildGraphData([c]);
    expect(g.nodes.find((n) => n.id === 'c:auth')?.type).toBe('concept');
    expect(g.nodes.find((n) => n.type === 'file')?.label).toBe('login.ts');
    expect(g.edges).toContainEqual({
      source: 'c:auth',
      target: 'p:src/login.ts',
      kind: 'concept-file',
    });
  });
  it('기능 점도, 기능에서 나가는 선도 만들지 않는다', () => {
    const c = { ...concept('auth'), codeLinks: ['src/login.ts'] } as Concept;
    const g = buildGraphData([c], { auth: ['src/tagged.ts'] });
    expect(g.nodes.every((n) => n.type === 'concept' || n.type === 'file')).toBe(true);
    expect(g.nodes.some((n) => n.id.startsWith('f:'))).toBe(false);
    expect(g.edges.every((e) => e.kind === 'concept-file')).toBe(true);
  });
  it('노드 href는 SPA 해시 라우트를 가리킨다', () => {
    const g = buildGraphData([concept('auth')]);
    expect(g.nodes.find((n) => n.id === 'c:auth')?.href).toBe('#/concept/auth');
  });
  it('mapping(@concept→파일)도 개념→파일로 연결한다', () => {
    const g = buildGraphData([concept('auth')], { auth: ['src/tagged.ts'] });
    expect(
      g.edges.some(
        (e) => e.source === 'c:auth' && e.target === 'p:src/tagged.ts' && e.kind === 'concept-file'
      )
    ).toBe(true);
  });
  it('개념의 codeLinks와 mapping이 같은 경로를 가리키면 엣지는 하나만 만든다', () => {
    const c = { ...concept('auth'), codeLinks: ['src/a.ts'] } as Concept;
    const g = buildGraphData([c], { auth: ['src/a.ts'] });
    expect(g.edges.filter((e) => e.target === 'p:src/a.ts').length).toBe(1);
  });
  it('여러 개념이 같은 파일을 가리키면 파일 노드는 하나로 합쳐진다', () => {
    const a = { ...concept('a'), codeLinks: ['src/shared.ts'] } as Concept;
    const b = { ...concept('b'), codeLinks: ['src/shared.ts'] } as Concept;
    const g = buildGraphData([a, b]);
    expect(g.nodes.filter((n) => n.id === 'p:src/shared.ts').length).toBe(1);
    expect(g.edges.filter((e) => e.target === 'p:src/shared.ts').length).toBe(2);
  });
});
