// @concept:knowledge-graph-view @concept:feature-index-row @concept:feature-spec-bridge @concept:globally-unique-slug
// tests/viewer/graph.test.ts
// 지식 그래프 데이터(buildGraphData)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - knowledge-graph-view 불변 "그래프는 기능을 기준으로 잇는다 — 기능에서 그 기능이 따르는
//    개념으로, 개념에서 그 개념에 걸린 코드 파일로"
//    → 기능·개념·파일 세 종류 노드와 기능→개념, 개념→파일 두 갈래 엣지만 만든다
//    → 기능에서 파일로 바로 가는 선은 만들지 않는다 (코드는 개념을 거쳐 이어진다)
//  - feature-spec-bridge interaction "지식 그래프는 이 기록이 적은 연결을 뿌리로 삼아 그린다"
//    → 기능 기록의 concepts 목록이 기능→개념 엣지가 된다
//    → 정의되지 않은 개념을 가리키는 항목은 매달 곳이 없으므로 선을 만들지 않는다
//  - feature-index-row 불변 "기능 하나만 펼쳐 보는 전용 화면은 만들지 않는다 — 기능은 목록의
//    줄과 지식 그래프의 점으로만 나타난다"
//    → 기능 노드의 href는 색인 줄로 돌려보내는 기능 주소(#/feature/:slug)를 가리킨다
//  - concept-code-mapping 정의 "개념 하나가 어느 파일들에 구현돼 있는지는, 코드에 붙은 표식을
//    거꾸로 모아 알아낸다" → mapping(@concept→파일)도 개념→파일로 연결한다 /
//    개념의 codeLinks도 같은 엣지가 된다
//  - globally-unique-slug 허용 "묶음 구조와 무관하게 이름표만으로 개념이나 기능을 찾아가는 것"
//    → 노드 href는 이름표를 쓴 SPA 해시 라우트를 가리킨다
//    → 여러 개념이 같은 파일을 가리키면 파일 노드는 하나로 합쳐진다 (같은 경로는 같은 점이다)
import { describe, it, expect } from 'vitest';
import { buildGraphData } from '../../src/viewer/graph.js';
import type { Concept } from '../../src/schema/concept.js';
import type { Feature } from '../../src/schema/feature.js';

const concept = (slug: string, group = ''): Concept =>
  ({
    slug,
    group,
    category: ['feature'],
    title: slug.toUpperCase(),
    status: 'red',
    description: { definition: 'd', analogy: '', components: [], example: '' },
    purpose: { reason: 'r', benefits: [], vision: '', painPoints: [] },
    actions: { allow: [], restrict: [], interaction: '' },
    principle: { immutableRules: [], tradeoffs: '', lifecycle: [] },
    relations: { prev: '', next: '', related: [] },
    codeLinks: [],
  }) as Concept;

const feature = (slug: string, concepts: string[] = [], codePaths: string[] = []): Feature => ({
  slug,
  group: '',
  title: slug.toUpperCase(),
  description: '',
  concepts,
  codePaths,
});

describe('buildGraphData', () => {
  it('기능·개념·파일 노드와 기능→개념, 개념→파일 엣지를 만든다', () => {
    const c = { ...concept('auth'), codeLinks: ['src/login.ts'] } as Concept;
    const g = buildGraphData([c], {}, [feature('login', ['auth'])]);
    expect(g.nodes.find((n) => n.id === 'f:login')?.type).toBe('feature');
    expect(g.nodes.find((n) => n.id === 'c:auth')?.type).toBe('concept');
    expect(g.nodes.find((n) => n.type === 'file')?.label).toBe('login.ts');
    expect(g.edges).toContainEqual({
      source: 'f:login',
      target: 'c:auth',
      kind: 'feature-concept',
    });
    expect(g.edges).toContainEqual({
      source: 'c:auth',
      target: 'p:src/login.ts',
      kind: 'concept-file',
    });
  });
  it('기능에서 파일로 바로 가는 선은 만들지 않는다', () => {
    const c = { ...concept('auth'), codeLinks: ['src/login.ts'] } as Concept;
    const g = buildGraphData([c], {}, [feature('login', ['auth'], ['src/login.ts'])]);
    expect(g.edges.every((e) => e.kind === 'feature-concept' || e.kind === 'concept-file')).toBe(
      true
    );
    expect(g.edges.some((e) => e.source === 'f:login' && e.target === 'p:src/login.ts')).toBe(
      false
    );
  });
  it('정의되지 않은 개념을 가리키는 기능 항목은 선을 만들지 않는다', () => {
    const g = buildGraphData([concept('auth')], {}, [feature('login', ['auth', 'ghost'])]);
    expect(g.edges.some((e) => e.target === 'c:ghost')).toBe(false);
    expect(g.nodes.some((n) => n.id === 'c:ghost')).toBe(false);
  });
  it('노드 href는 이름표를 쓴 SPA 해시 라우트를 가리킨다', () => {
    const g = buildGraphData([concept('auth')], {}, [feature('login', ['auth'])]);
    expect(g.nodes.find((n) => n.id === 'c:auth')?.href).toBe('#/concept/auth');
    expect(g.nodes.find((n) => n.id === 'f:login')?.href).toBe('#/feature/login');
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
  it('여러 기능이 같은 개념을 가리키면 개념 노드는 하나로 합쳐진다', () => {
    const g = buildGraphData([concept('auth')], {}, [
      feature('login', ['auth']),
      feature('logout', ['auth']),
    ]);
    expect(g.nodes.filter((n) => n.id === 'c:auth').length).toBe(1);
    expect(g.edges.filter((e) => e.target === 'c:auth').length).toBe(2);
  });
});
