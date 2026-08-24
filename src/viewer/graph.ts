// @concept:knowledge-graph-view
// src/viewer/graph.ts
// concept · 구현 경로(file)의 관계를 지식 그래프 데이터로 표현한다.
// 기능은 이 그림에 점으로 들어오지 않는다 — 목록의 색인 줄로만 나타난다(feature-index-row).
// 렌더는 클라이언트(assets/viewer.js)가 담당하고, 여기서는 순수 데이터만 만든다.
import type { Concept } from '../schema/concept.js';

export type NodeType = 'concept' | 'file';

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  href: string;
  title: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: 'concept-file';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// 노드 클릭 시 이동할 SPA 해시 라우트. 파일 노드는 이동 대상이 없다.
const conceptHref = (c: Concept) => `#/concept/${c.slug}`;
const baseName = (p: string) => p.split('/').filter(Boolean).pop() ?? p;
const own = (o: Record<string, string[]>, k: string) =>
  Object.prototype.hasOwnProperty.call(o, k) ? o[k] : [];

// codeLinksBySlug: @concept 매핑 캐시(mapping.json) 등 개념→코드 경로의 외부 출처.
// 개념 자신의 codeLinks와 합쳐 "개념→파일" 연결을 만든다(같은 경로는 하나의 파일 노드를 공유).
export function buildGraphData(
  concepts: Concept[],
  codeLinksBySlug: Record<string, string[]> = {}
): GraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add = (n: GraphNode) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    nodes.push(n);
  };

  for (const c of concepts) {
    add({
      id: `c:${c.slug}`,
      label: c.title,
      type: 'concept',
      href: conceptHref(c),
      title: c.slug,
    });
    const links = [...new Set([...(c.codeLinks ?? []), ...own(codeLinksBySlug, c.slug)])];
    for (const path of links) {
      add({ id: `p:${path}`, label: baseName(path), type: 'file', href: '', title: path });
      edges.push({ source: `c:${c.slug}`, target: `p:${path}`, kind: 'concept-file' });
    }
  }
  return { nodes, edges };
}
