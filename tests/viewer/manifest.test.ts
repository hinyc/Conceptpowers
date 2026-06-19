// tests/viewer/manifest.test.ts
import { describe, it, expect } from 'vitest'
import { buildManifest } from '../../src/viewer/manifest.js'
import type { Concept } from '../../src/schema/concept.js'
import type { Feature } from '../../src/schema/feature.js'

const concept = (slug: string, group = ''): Concept => ({
  slug, group, category: ['role'], title: slug.toUpperCase(), eyebrow: '', status: 'green',
  description: { definition: 'd', analogy: '', components: [], example: '' },
  purpose: { reason: 'r', benefits: [], vision: '', painPoints: [] },
  actions: { allow: [], restrict: [], interaction: '' },
  principle: { immutableRules: [], tradeoffs: '', lifecycle: [] },
  relations: { prev: '', next: '', related: [] }, codeLinks: []
} as Concept)

const feature = (slug: string, concepts: string[], codePaths: string[] = [], group = ''): Feature => ({
  slug, group, title: slug, description: '', concepts, codePaths
} as Feature)

describe('buildManifest', () => {
  it('locale와 그래프 데이터를 담는다', () => {
    const m = buildManifest([concept('auth')], [feature('login', ['auth'])], 'en')
    expect(m.version).toBe(1)
    expect(m.locale).toBe('en')
    expect(m.graph.nodes.some(n => n.id === 'c:auth')).toBe(true)
  })
  it('개념 엔트리는 data/*.json 상대 URL과 메타를 가진다', () => {
    const m = buildManifest([concept('admin-role', 'auth')], [], 'ko')
    expect(m.concepts[0]).toMatchObject({
      slug: 'admin-role', group: 'auth', title: 'ADMIN-ROLE',
      status: 'green', category: ['role'], url: '../data/auth/admin-role.json'
    })
  })
  it('그룹 없는 개념 URL은 ../data/<slug>.json', () => {
    const m = buildManifest([concept('solo')], [], 'ko')
    expect(m.concepts[0].url).toBe('../data/solo.json')
  })
  it('기능 엔트리는 features 상대 URL과 코드경로 개수를 가진다', () => {
    const m = buildManifest([], [feature('login', ['auth'], ['a.ts', 'b.ts'], 'flows')], 'ko')
    expect(m.features[0]).toMatchObject({
      slug: 'login', group: 'flows', codePathCount: 2,
      url: '../../features/flows/login.json'
    })
  })
  it('개념 엔트리는 codeLinks(concept.codeLinks ∪ mapping)를 담는다', () => {
    const c = { ...concept('auth'), codeLinks: ['src/a.ts'] } as Concept
    const m = buildManifest([c], [], 'ko', { auth: ['src/b.ts'] })
    expect(m.concepts[0].codeLinks.sort()).toEqual(['src/a.ts', 'src/b.ts'])
  })
  it('mapping이 없으면 codeLinks는 concept.codeLinks만 담는다', () => {
    const c = { ...concept('auth'), codeLinks: ['src/a.ts'] } as Concept
    const m = buildManifest([c], [], 'ko')
    expect(m.concepts[0].codeLinks).toEqual(['src/a.ts'])
  })
})
