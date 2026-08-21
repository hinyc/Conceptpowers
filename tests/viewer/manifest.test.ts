// @concept:generated-not-hand-edited @concept:feature-spec-bridge @concept:globally-unique-slug
// tests/viewer/manifest.test.ts
// 뷰어 색인(buildManifest)을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - generated-not-hand-edited 구성요소 "생성물: 원본에서 자동으로 만들어지는 결과"
//    → manifest는 원본 data/*.json을 가리키는 상대 URL만 담는다 (본문을 복제하지 않는다)
//  - globally-unique-slug 허용 "묶음 구조와 무관하게 이름표만으로 개념이나 기능을 찾아가는 것"
//    → 그룹 없는 개념 URL은 ../data/<slug>.json / 기능 엔트리는 features 상대 URL을 가진다
//  - concept-code-mapping 정의 "개념 하나가 어느 파일들에 구현돼 있는지는, 코드에 붙은 표식을 거꾸로
//    모아 알아낸다" → 개념 엔트리의 codeLinks는 concept.codeLinks ∪ mapping이다 / mapping이 없으면 codeLinks만
//  - feature-spec-bridge 구성요소 "구현 코드: 이 기능을 구현한 코드 경로 목록" → 기능 엔트리가 코드경로 개수를 담는다
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
    eyebrow: '',
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
    description: '',
    concepts,
    codePaths,
  }) as Feature;

describe('buildManifest', () => {
  it('locale와 그래프 데이터를 담는다', () => {
    const m = buildManifest([concept('auth')], [feature('login', ['auth'])], 'en');
    expect(m.version).toBe(1);
    expect(m.locale).toBe('en');
    expect(m.graph.nodes.some((n) => n.id === 'c:auth')).toBe(true);
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
  it('기능 엔트리는 features 상대 URL과 코드경로 개수를 가진다', () => {
    const m = buildManifest([], [feature('login', ['auth'], ['a.ts', 'b.ts'], 'flows')], 'ko');
    expect(m.features[0]).toMatchObject({
      slug: 'login',
      group: 'flows',
      codePathCount: 2,
      url: '../../features/flows/login.json',
    });
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
