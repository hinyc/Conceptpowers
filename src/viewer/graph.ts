// src/viewer/graph.ts
// concept · feature · 구현 경로(file)의 관계를 지식 그래프 데이터로 표현한다.
// 렌더는 클라이언트(assets/viewer.js)가 담당하고, 여기서는 순수 데이터만 만든다.
import type { Concept } from '../schema/concept.js'
import type { Feature } from '../schema/feature.js'

export type NodeType = 'concept' | 'feature' | 'file'

export interface GraphNode {
  id: string
  label: string
  type: NodeType
  href: string
  title: string
}

export interface GraphEdge {
  source: string
  target: string
  kind: 'feature-concept' | 'feature-file'
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// 노드 클릭 시 이동할 SPA 해시 라우트. 파일 노드는 이동 대상이 없다.
const conceptHref = (c: Concept) => `#/concept/${c.slug}`
const featureHref = (f: Feature) => `#/feature/${f.slug}`
const baseName = (p: string) => p.split('/').filter(Boolean).pop() ?? p

export function buildGraphData(concepts: Concept[], features: Feature[]): GraphData {
  const conceptSlugs = new Set(concepts.map((c) => c.slug))
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const seen = new Set<string>()
  const add = (n: GraphNode) => {
    if (seen.has(n.id)) return
    seen.add(n.id)
    nodes.push(n)
  }

  for (const c of concepts) {
    add({ id: `c:${c.slug}`, label: c.title, type: 'concept', href: conceptHref(c), title: c.slug })
  }
  for (const f of features) {
    add({ id: `f:${f.slug}`, label: f.title, type: 'feature', href: featureHref(f), title: f.slug })
    for (const slug of f.concepts) {
      if (!conceptSlugs.has(slug)) continue // 존재하지 않는 개념 참조는 무시
      edges.push({ source: `f:${f.slug}`, target: `c:${slug}`, kind: 'feature-concept' })
    }
    for (const path of f.codePaths) {
      const id = `p:${path}`
      add({ id, label: baseName(path), type: 'file', href: '', title: path })
      edges.push({ source: `f:${f.slug}`, target: id, kind: 'feature-file' })
    }
  }
  return { nodes, edges }
}
