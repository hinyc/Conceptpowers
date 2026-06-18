// src/viewer/graph.ts
// concept · feature · 구현 경로(file)의 관계를 지식 그래프로 표현한다.
// 데이터(노드/엣지) 생성은 순수 함수, 렌더는 의존성 0의 인라인 force 시뮬레이션.
import type { Concept } from '../schema/concept.js'
import type { Feature } from '../schema/feature.js'
import type { Locale } from '../schema/initConfig.js'
import { viewerStrings } from '../i18n/messages.js'
import { esc } from './template.js'

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

// concept slug → 그 개념을 참조하는 feature 목록 (개념→기능 역방향 인덱스)
export function reverseFeatureIndex(features: Feature[]): Map<string, Feature[]> {
  const idx = new Map<string, Feature[]>()
  for (const f of features) {
    for (const slug of f.concepts) {
      idx.set(slug, [...(idx.get(slug) ?? []), f])
    }
  }
  return idx
}

const conceptHref = (c: Concept) => (c.group ? `${c.group}/${c.slug}.html` : `${c.slug}.html`)
const featureHref = (f: Feature) =>
  f.group ? `features/${f.group}/${f.slug}.html` : `features/${f.slug}.html`
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

// 데이터를 안전하게 <script>에 임베드: `<`를 유니코드 이스케이프해 태그 탈출 방지.
function embed(data: GraphData): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export function graphPage(data: GraphData, locale: Locale = 'ko'): string {
  const t = viewerStrings[locale]
  const legend =
    `<span class="lg"><i class="dot dot--concept"></i>${esc(t.conceptNode)}</span>` +
    `<span class="lg"><i class="dot dot--feature"></i>${esc(t.featureNode)}</span>` +
    `<span class="lg"><i class="dot dot--file"></i>${esc(t.fileNode)}</span>`
  return `<!DOCTYPE html>
<html lang="${locale}"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(t.graphTitle)} · Conceptpowers</title>
<link rel="stylesheet" href="assets/concept.css"/></head>
<body class="graph-body">
<header class="graph-bar"><a class="back" href="index.html">← ${esc(t.conceptList)}</a>
<strong>${esc(t.graphTitle)}</strong><span class="legend">${legend}</span></header>
<svg id="graph" class="graph"></svg>
<script>${GRAPH_SCRIPT}</script>
<script>window.__cpRenderGraph(${embed(data)});</script>
</body></html>\n`
}

// 의존성 없는 force-directed 시뮬레이션. 라벨은 textContent로만 설정해 XSS를 차단한다.
const GRAPH_SCRIPT = `
window.__cpRenderGraph = function (data) {
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.getElementById('graph');
  function size() { return { w: svg.clientWidth || window.innerWidth, h: svg.clientHeight || (window.innerHeight - 56) }; }
  var dim = size(), W = dim.w, H = dim.h;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  var n = data.nodes.length || 1;
  var nodes = data.nodes.map(function (d, i) {
    var a = i / n * Math.PI * 2, R = Math.min(W, H) * 0.32;
    return { id: d.id, label: d.label, type: d.type, href: d.href, title: d.title,
      x: W / 2 + Math.cos(a) * R, y: H / 2 + Math.sin(a) * R, vx: 0, vy: 0, fixed: false, drag: false };
  });
  var byId = {}; nodes.forEach(function (d) { byId[d.id] = d; });
  var edges = data.edges.map(function (e) { return { s: byId[e.source], t: byId[e.target] }; })
    .filter(function (e) { return e.s && e.t; });
  var gE = document.createElementNS(NS, 'g'); svg.appendChild(gE);
  var gN = document.createElementNS(NS, 'g'); svg.appendChild(gN);
  var lines = edges.map(function () { var l = document.createElementNS(NS, 'line'); l.setAttribute('class', 'gedge'); gE.appendChild(l); return l; });
  function toLocal(ev) { var r = svg.getBoundingClientRect(); return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H }; }
  var groups = nodes.map(function (d) {
    var g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'gnode gnode--' + d.type);
    var c = document.createElementNS(NS, 'circle'); c.setAttribute('r', d.type === 'file' ? 5 : 9); g.appendChild(c);
    var tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', 13); tx.setAttribute('y', 4); tx.textContent = d.label; g.appendChild(tx);
    var tt = document.createElementNS(NS, 'title'); tt.textContent = d.title || d.label; g.appendChild(tt);
    g.addEventListener('mousedown', function (ev) {
      ev.preventDefault(); d.fixed = true; d.drag = false;
      function mv(e2) { var p = toLocal(e2); d.x = p.x; d.y = p.y; d.drag = true; }
      function up() { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); setTimeout(function () { d.drag = false; }, 0); }
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    });
    if (d.href) { g.style.cursor = 'pointer'; g.addEventListener('click', function () { if (!d.drag) window.location.href = d.href; }); }
    gN.appendChild(g); return g;
  });
  function tick() {
    for (var i = 0; i < nodes.length; i++) for (var j = i + 1; j < nodes.length; j++) {
      var a = nodes[i], b = nodes[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 0.01, dd = Math.sqrt(d2), f = 2600 / d2;
      a.vx += dx / dd * f; a.vy += dy / dd * f; b.vx -= dx / dd * f; b.vy -= dy / dd * f;
    }
    edges.forEach(function (e) {
      var dx = e.t.x - e.s.x, dy = e.t.y - e.s.y, dd = Math.sqrt(dx * dx + dy * dy) + 0.01, f = (dd - 96) * 0.02;
      e.s.vx += dx / dd * f; e.s.vy += dy / dd * f; e.t.vx -= dx / dd * f; e.t.vy -= dy / dd * f;
    });
    nodes.forEach(function (d) {
      d.vx += (W / 2 - d.x) * 0.002; d.vy += (H / 2 - d.y) * 0.002; d.vx *= 0.85; d.vy *= 0.85;
      if (!d.fixed) { d.x += d.vx; d.y += d.vy; }
      d.x = Math.max(24, Math.min(W - 24, d.x)); d.y = Math.max(24, Math.min(H - 24, d.y));
    });
    lines.forEach(function (l, i) { var e = edges[i]; l.setAttribute('x1', e.s.x); l.setAttribute('y1', e.s.y); l.setAttribute('x2', e.t.x); l.setAttribute('y2', e.t.y); });
    groups.forEach(function (g, i) { g.setAttribute('transform', 'translate(' + nodes[i].x + ',' + nodes[i].y + ')'); });
    requestAnimationFrame(tick);
  }
  if (data.nodes.length) requestAnimationFrame(tick);
};
`
