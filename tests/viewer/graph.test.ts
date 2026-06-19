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
  it('개념의 codeLinks로 개념→파일 엣지와 파일 노드를 만든다', () => {
    const c = { ...concept('auth'), codeLinks: ['src/auth.ts'] } as Concept
    const g = buildGraphData([c], [])
    expect(g.nodes.find(n => n.id === 'p:src/auth.ts')?.type).toBe('file')
    expect(g.edges).toContainEqual(
      expect.objectContaining({ source: 'c:auth', target: 'p:src/auth.ts', kind: 'concept-file' })
    )
  })
  it('mapping(@concept→파일)도 개념→파일로 연결한다', () => {
    const g = buildGraphData([concept('auth')], [], { auth: ['src/tagged.ts'] })
    expect(g.edges.some(e =>
      e.source === 'c:auth' && e.target === 'p:src/tagged.ts' && e.kind === 'concept-file'
    )).toBe(true)
  })
  it('개념과 기능이 같은 파일을 공유하면 파일 노드는 하나로 합쳐진다', () => {
    const c = { ...concept('auth'), codeLinks: ['src/login.ts'] } as Concept
    const g = buildGraphData([c], [feature('login', ['auth'], ['src/login.ts'])])
    expect(g.nodes.filter(n => n.id === 'p:src/login.ts').length).toBe(1)
    expect(g.edges.some(e => e.kind === 'concept-file')).toBe(true)
    expect(g.edges.some(e => e.kind === 'feature-file')).toBe(true)
    expect(g.edges.some(e => e.kind === 'feature-concept')).toBe(true)
  })
})
