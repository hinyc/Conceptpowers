// @concept:generated-not-hand-edited @concept:feature-index-row @concept:globally-unique-slug
// tests/viewer/manifest.test.ts
// 뷰어 색인(buildManifest)을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - generated-not-hand-edited 구성요소 "생성물: 원본에서 자동으로 만들어지는 결과"
//    → manifest는 원본 data/*.json을 가리키는 상대 URL만 담는다 (본문을 복제하지 않는다)
//  - globally-unique-slug 허용 "묶음 구조와 무관하게 이름표만으로 개념이나 기능을 찾아가는 것"
//    → 그룹 없는 개념 URL은 ../data/<slug>.json
//  - concept-code-mapping 정의 "개념 하나가 어느 파일들에 구현돼 있는지는, 코드에 붙은 표식을 거꾸로
//    모아 알아낸다" → 개념 엔트리의 codeLinks는 concept.codeLinks ∪ mapping이다 / mapping이 없으면 codeLinks만
//  - feature-index-row 불변 "기능 줄에는 그 기능이 따르는 개념이 하나도 빠짐없이 붙는다"
//    → 기능 엔트리가 따르는 개념 이름표를 전부 담는다
//  - feature-index-row 허용 "한 줄에 붙은 개념 딱지를 눌러 그 개념 화면으로 가는 것"
//    → 갈 곳이 없는(정의되지 않은) 개념 참조는 딱지로 담지 않는다
//  - feature-index-row 제한 "기능 줄에 코드 경로를 늘어놓는 것" → 기능 엔트리는 코드 경로를 담지 않는다
//  - output-locale 구성요소 "적용 대상: … 사용자에게 보이는 안내" → manifest가 locale을 담아 화면 언어의 근거가 된다
import { describe, it, expect } from 'vitest';
import { buildManifest } from '../../src/viewer/manifest.js';
import type { Concept } from '../../src/schema/concept.js';
import type { Feature } from '../../src/schema/feature.js';

const concept = (slug: string, group = ''): Concept =>
  ({
    slug,
    group,
    category: ['role'],
    title: slug.toUpperCase(),
    status: 'green',
    description: { definition: 'd', analogy: '', components: [], example: '' },
    purpose: { reason: 'r', benefits: [], vision: '', painPoints: [] },
    actions: { allow: [], restrict: [], interaction: '' },
    principle: { immutableRules: [], tradeoffs: '', lifecycle: [] },
    relations: { prev: '', next: '', related: [] },
    codeLinks: [],
  }) as Concept;

const feature = (slug: string, concepts: string[], codePaths: string[] = [], group = ''): Feature =>
  ({
    slug,
    group,
    title: slug,
    description: slug + ' 설명',
    concepts,
    codePaths,
  }) as Feature;

describe('buildManifest', () => {
  it('locale와 그래프 데이터를 담는다', () => {
    const m = buildManifest([concept('auth')], [feature('login', ['auth'])], 'en');
    expect(m.version).toBe(1);
    expect(m.locale).toBe('en');
    expect(m.graph.nodes.some((n) => n.id === 'c:auth')).toBe(true);
    // 그래프는 기능을 기준으로 잇는다(knowledge-graph-view) — 기능 노드와 기능→개념 엣지도 담는다
    expect(m.graph.nodes.some((n) => n.id === 'f:login')).toBe(true);
    expect(m.graph.edges).toContainEqual({
      source: 'f:login',
      target: 'c:auth',
      kind: 'feature-concept',
    });
  });
  it('개념 엔트리는 data/*.json 상대 URL과 메타를 가진다', () => {
    const m = buildManifest([concept('admin-role', 'auth')], [], 'ko');
    expect(m.concepts[0]).toMatchObject({
      slug: 'admin-role',
      group: 'auth',
      title: 'ADMIN-ROLE',
      status: 'green',
      category: ['role'],
      url: '../data/auth/admin-role.json',
    });
  });
  it('그룹 없는 개념 URL은 ../data/<slug>.json', () => {
    const m = buildManifest([concept('solo')], [], 'ko');
    expect(m.concepts[0].url).toBe('../data/solo.json');
  });
  it('기능 엔트리는 색인 줄에 필요한 것만 담는다 — 따르는 개념 전부, 코드 경로는 없이', () => {
    const m = buildManifest(
      [concept('auth'), concept('session')],
      [feature('login', ['auth', 'session'], ['a.ts', 'b.ts'], 'flows')],
      'ko'
    );
    expect(m.features[0]).toEqual({
      slug: 'login',
      group: 'flows',
      title: 'login',
      description: 'login 설명',
      concepts: ['auth', 'session'],
    });
  });
  it('정의되지 않은 개념을 가리키는 참조는 딱지로 담지 않는다', () => {
    const m = buildManifest([concept('auth')], [feature('login', ['auth', 'ghost'])], 'ko');
    expect(m.features[0].concepts).toEqual(['auth']);
  });
  it('개념 엔트리는 codeLinks(concept.codeLinks ∪ mapping)를 담는다', () => {
    const c = { ...concept('auth'), codeLinks: ['src/a.ts'] } as Concept;
    const m = buildManifest([c], [], 'ko', { auth: ['src/b.ts'] });
    expect(m.concepts[0].codeLinks.sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });
  it('mapping이 없으면 codeLinks는 concept.codeLinks만 담는다', () => {
    const c = { ...concept('auth'), codeLinks: ['src/a.ts'] } as Concept;
    const m = buildManifest([c], [], 'ko');
    expect(m.concepts[0].codeLinks).toEqual(['src/a.ts']);
  });
});
