// tests/viewer/graph.test.ts
import { describe, it, expect } from 'vitest'
import { buildGraphData } from '../../src/viewer/graph.js'
import type { Concept } from '../../src/schema/concept.js'
import type { Feature } from '../../src/schema/feature.js'

const concept = (slug: string, group = ''): Concept => ({
  slug, group, category: ['feature'], title: slug.toUpperCase(), eyebrow: '', status: 'red',
  description: { definition: 'd', analogy: '', components: [], example: '' },
  purpose: { reason: 'r', benefits: [], vision: '', painPoints: [] },
  actions: { allow: [], restrict: [], interaction: '' },
  principle: { immutableRules: [], tradeoffs: '', lifecycle: [] },
  relations: { prev: '', next: '', related: [] }, codeLinks: []
} as Concept)

const feature = (slug: string, concepts: string[], codePaths: string[] = []): Feature => ({
  slug, group: '', title: slug, description: '', concepts, codePaths
} as Feature)

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
  it('노드 href는 SPA 해시 라우트를 가리킨다', () => {
    const g = buildGraphData([concept('auth')], [feature('login', ['auth'])])
    expect(g.nodes.find(n => n.id === 'c:auth')?.href).toBe('#/concept/auth')
    expect(g.nodes.find(n => n.id === 'f:login')?.href).toBe('#/feature/login')
  })
  it('존재하지 않는 개념을 참조하는 엣지는 만들지 않는다', () => {
    const g = buildGraphData([concept('auth')], [feature('login', ['ghost'])])
    expect(g.edges.some(e => e.target === 'c:ghost')).toBe(false)
  })
})
