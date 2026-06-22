// tests/viewer/subgraph.test.ts
// 브라우저 SPA(assets/viewer.js)의 순수 함수 subgraphFor를 node:vm으로 로드해 검증한다.
// 최상위는 함수/변수 선언만 하므로(boot()는 index.html이 호출) DOM 없이 안전히 평가된다.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { buildGraphData } from '../../src/viewer/graph.js'
import type { Concept } from '../../src/schema/concept.js'
import type { Feature } from '../../src/schema/feature.js'

const here = dirname(fileURLToPath(import.meta.url))
// 최상위 boot() 호출만 제거하면(SPA 진입점, 브라우저에서 index.html이 호출) DOM/네트워크 없이 평가된다.
const src = readFileSync(join(here, '../../assets/viewer.js'), 'utf8').replace(/\nboot\(\)\s*$/, '\n')

// sloppy 모드 스크립트의 최상위 function 선언은 컨텍스트 객체의 속성이 된다.
const ctx: Record<string, unknown> = { window: {}, document: {} }
vm.createContext(ctx)
vm.runInContext(src, ctx)
const subgraphFor = ctx.subgraphFor as (
  data: ReturnType<typeof buildGraphData>,
  slug: string,
) => ReturnType<typeof buildGraphData>

const concept = (slug: string): Concept => ({
  slug, group: '', category: ['feature'], title: slug.toUpperCase(), eyebrow: '', status: 'red',
  description: { definition: 'd', analogy: '', components: [], example: '' },
  purpose: { reason: 'r', benefits: [], vision: '', painPoints: [] },
  actions: { allow: [], restrict: [], interaction: '' },
  principle: { immutableRules: [], tradeoffs: '', lifecycle: [] },
  relations: { prev: '', next: '', related: [] }, codeLinks: []
} as Concept)

const feature = (slug: string, concepts: string[], codePaths: string[] = []): Feature =>
  ({ slug, group: '', title: slug, description: '', concepts, codePaths } as Feature)

describe('viewer subgraphFor', () => {
  // a, b 두 개념. f1은 a·b 둘 다 실현(코드 x), f2는 b만 실현(코드 y). a는 코드 z 직접 연결.
  const full = buildGraphData(
    [concept('a'), concept('b')],
    [feature('f1', ['a', 'b'], ['src/x.ts']), feature('f2', ['b'], ['src/y.ts'])],
    { a: ['src/z.ts'] },
  )

  it('포커스 개념의 이웃(개념·실현 기능·코드·형제 개념)만 남긴다', () => {
    const sub = subgraphFor(full, 'a')
    const ids = new Set(sub.nodes.map((n) => n.id))
    expect(ids).toEqual(new Set(['c:a', 'f:f1', 'p:src/z.ts', 'p:src/x.ts', 'c:b']))
    // f2/그 코드(y), b의 코드 등 무관한 노드는 빠진다
    expect(ids.has('f:f2')).toBe(false)
    expect(ids.has('p:src/y.ts')).toBe(false)
  })

  it('남은 노드 양끝을 모두 가진 엣지만 보존한다(3종 모두 표현)', () => {
    const sub = subgraphFor(full, 'a')
    const kinds = new Set(sub.edges.map((e) => e.kind))
    expect(kinds.has('feature-concept')).toBe(true) // f1→a, f1→b(형제)
    expect(kinds.has('feature-file')).toBe(true) // f1→x
    expect(kinds.has('concept-file')).toBe(true) // a→z
    // 끊긴 엣지(끝점이 제외된)는 없어야 한다
    for (const e of sub.edges) {
      expect(sub.nodes.some((n) => n.id === e.source)).toBe(true)
      expect(sub.nodes.some((n) => n.id === e.target)).toBe(true)
    }
  })

  it('연결이 전혀 없는 개념은 자기 노드 하나만 남는다', () => {
    const isolated = buildGraphData([concept('lonely')], [])
    const sub = subgraphFor(isolated, 'lonely')
    expect(sub.nodes.map((n) => n.id)).toEqual(['c:lonely'])
    expect(sub.edges).toEqual([])
  })
})
