// tests/viewer/graph.test.ts
import { describe, it, expect } from 'vitest'
import { buildGraphData, reverseFeatureIndex, graphPage } from '../../src/viewer/graph.js'
import type { Concept } from '../../src/schema/concept.js'
import type { Feature } from '../../src/schema/feature.js'

const concept = (slug: string, group = ''): Concept => ({
  slug, group, category: ['feature'], title: slug.toUpperCase(), eyebrow: '',
  description: { definition: 'd', analogy: '', components: [], example: '' },
  purpose: { reason: 'r', benefits: [], vision: '', painPoints: [] },
  actions: { allow: [], restrict: [], interaction: '' },
  principle: { immutableRules: [], tradeoffs: '', lifecycle: [] },
  relations: { prev: '', next: '', related: [] }, codeLinks: []
} as Concept)

const feature = (slug: string, concepts: string[], codePaths: string[] = []): Feature => ({
  slug, group: '', title: slug, description: '', concepts, codePaths
} as Feature)

describe('reverseFeatureIndex', () => {
  it('concept slug → 그 개념을 참조하는 기능 목록을 만든다', () => {
    const idx = reverseFeatureIndex([feature('login', ['auth', 'session']), feature('logout', ['auth'])])
    expect(idx.get('auth')?.map(f => f.slug).sort()).toEqual(['login', 'logout'])
    expect(idx.get('session')?.map(f => f.slug)).toEqual(['login'])
    expect(idx.get('billing')).toBeUndefined()
  })
})

describe('buildGraphData', () => {
  it('개념·기능·파일 노드와 기능↔개념, 기능↔파일 엣지를 만든다', () => {
    const g = buildGraphData(
      [concept('auth')],
      [feature('login', ['auth'], ['src/login.ts'])]
    )
    expect(g.nodes.find(n => n.id === 'c:auth')?.type).toBe('concept')
    expect(g.nodes.find(n => n.id === 'f:login')?.type).toBe('feature')
    expect(g.nodes.find(n => n.type === 'file')?.label).toBe('login.ts')
    expect(g.edges).toContainEqual(expect.objectContaining({ source: 'f:login', target: 'c:auth' }))
    expect(g.edges.some(e => e.source === 'f:login' && e.target.startsWith('p:'))).toBe(true)
  })
  it('존재하지 않는 개념을 참조하는 엣지는 만들지 않는다', () => {
    const g = buildGraphData([concept('auth')], [feature('login', ['ghost'])])
    expect(g.edges.some(e => e.target === 'c:ghost')).toBe(false)
  })
})

describe('graphPage', () => {
  it('svg와 그래프 데이터(JSON)를 포함한다', () => {
    const g = buildGraphData([concept('auth')], [feature('login', ['auth'])])
    const html = graphPage(g, 'ko')
    expect(html).toContain('<svg')
    expect(html).toContain('"c:auth"')
    expect(html).toContain('href="assets/concept.css"')
  })
  it('노드 라벨의 HTML을 이스케이프한다 (XSS 방지)', () => {
    const g = buildGraphData([concept('auth')], [feature('login', ['auth'])])
    g.nodes[0] = { ...g.nodes[0], label: '<script>x</script>' }
    const html = graphPage(g, 'ko')
    expect(html).not.toContain('<script>x</script>')
  })
})
