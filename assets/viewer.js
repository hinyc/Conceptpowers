// assets/viewer.js — Conceptpowers 단일 뷰어(SPA). 의존성 0.
// manifest.json을 읽고, 개념/기능 본문은 원본 data/*.json을 fetch해 렌더한다.
// 해시 라우트: #/ (목록) · #/concept/:slug · #/feature/:slug · #/graph
'use strict'

var I18N = {
  ko: {
    appTitle: '개념 목록', description: '설명', purpose: '목적', allow: '허용 행동',
    restrict: '제한 행동', principle: '운영 원칙', conceptList: '개념 목록',
    statusApproved: '승인됨', statusUnapproved: '미승인', statusPending: '보류',
    featureList: '기능 목록', relatedFeatures: '관련 기능', relatedConcepts: '관련 개념',
    implementationPaths: '구현 경로', featureEyebrow: '기능', graphTitle: '지식 그래프',
    openGraph: '지식 그래프 보기', conceptNode: '개념', featureNode: '기능', fileNode: '파일',
    back: '개념 목록', empty: '아직 개념이 없습니다.', loadError: '데이터를 불러오지 못했습니다.',
    notFound: '대상을 찾을 수 없습니다.'
  },
  en: {
    appTitle: 'Concepts', description: 'Description', purpose: 'Purpose', allow: 'Allowed',
    restrict: 'Restricted', principle: 'Operating Principles', conceptList: 'Concepts',
    statusApproved: 'Approved', statusUnapproved: 'Unapproved', statusPending: 'Pending',
    featureList: 'Features', relatedFeatures: 'Related Features', relatedConcepts: 'Related Concepts',
    implementationPaths: 'Implementation', featureEyebrow: 'Feature', graphTitle: 'Knowledge Graph',
    openGraph: 'View Knowledge Graph', conceptNode: 'Concept', featureNode: 'Feature', fileNode: 'File',
    back: 'Concepts', empty: 'No concepts yet.', loadError: 'Failed to load data.',
    notFound: 'Not found.'
  }
}

var state = { manifest: null, t: I18N.ko }
var renderGen = 0 // 라우트가 바뀌면 증가 → 그래프 애니메이션 루프 종료 신호

// ---- DOM 헬퍼: 텍스트는 textContent로만 넣어 XSS를 차단한다 ----
function h(tag, attrs, children) {
  var node = document.createElementNS(
    tag === 'svg' || tag === 'g' ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml',
    tag
  )
  if (attrs) {
    for (var k in attrs) {
      if (attrs[k] == null) continue
      if (k === 'class') node.setAttribute('class', attrs[k])
      else if (k === 'href') node.setAttribute('href', attrs[k])
      else node.setAttribute(k, attrs[k])
    }
  }
  append(node, children)
  return node
}
function append(node, children) {
  if (children == null) return
  if (Array.isArray(children)) {
    children.forEach(function (c) { append(node, c) })
  } else if (typeof children === 'string' || typeof children === 'number') {
    node.appendChild(document.createTextNode(String(children)))
  } else {
    node.appendChild(children)
  }
}
function ul(items, cls) {
  if (!items || !items.length) return null
  return h('ul', cls ? { class: cls } : null, items.map(function (i) { return h('li', null, i) }))
}
function statusBadge(status) {
  var t = state.t
  var label = status === 'green' ? t.statusApproved : status === 'pending' ? t.statusPending : t.statusUnapproved
  return h('span', { class: 'badge badge--' + (status || 'red') }, label)
}
function setApp(node, opts) {
  document.body.className = opts && opts.graph ? 'viewing-graph' : ''
  var app = document.getElementById('app')
  app.textContent = ''
  app.appendChild(node)
}
function pagenav() {
  var t = state.t
  return h('nav', { class: 'pagenav' }, [
    h('a', { href: '#/' }, t.conceptList), ' · ',
    h('a', { href: '#/graph' }, t.graphTitle)
  ])
}

// ---- 데이터 ----
function fetchJson(url) {
  return fetch(url, { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url)
    return r.json()
  })
}
function conceptEntry(slug) {
  return (state.manifest.concepts || []).filter(function (c) { return c.slug === slug })[0] || null
}
function featureEntry(slug) {
  return (state.manifest.features || []).filter(function (f) { return f.slug === slug })[0] || null
}
function conceptTitle(slug) {
  var e = conceptEntry(slug)
  return e ? e.title : slug
}
// 개념을 참조하는 기능들(그래프 엣지에서 역추적)
function relatedFeatures(slug) {
  var edges = (state.manifest.graph && state.manifest.graph.edges) || []
  return edges
    .filter(function (e) { return e.kind === 'feature-concept' && e.target === 'c:' + slug })
    .map(function (e) { return featureEntry(e.source.slice(2)) })
    .filter(Boolean)
}

// ---- 뷰: 목록 ----
function viewIndex() {
  var t = state.t
  var m = state.manifest
  var groups = {}
  ;(m.concepts || []).forEach(function (c) {
    var g = c.group || '(ungrouped)'
    ;(groups[g] = groups[g] || []).push(c)
  })
  var sections = Object.keys(groups).map(function (g) {
    return h('section', { class: 'group' }, [
      h('h2', null, g),
      h('ul', null, groups[g].map(function (c) {
        return h('li', null, [
          statusBadge(c.status), ' ',
          h('a', { href: '#/concept/' + c.slug }, c.title), ' ',
          h('small', null, (c.category || []).join(', '))
        ])
      }))
    ])
  })
  var featureSection = (m.features || []).length
    ? h('section', { class: 'group' }, [
        h('h2', null, t.featureList),
        h('ul', null, m.features.map(function (f) {
          return h('li', null, [
            h('a', { href: '#/feature/' + f.slug }, f.title), ' ',
            h('small', null, String(f.codePathCount))
          ])
        }))
      ])
    : null
  var body = (m.concepts || []).length ? sections : [h('p', { class: 'muted' }, t.empty)]
  setApp(h('div', { class: 'wrap' }, [
    h('header', { class: 'hero' }, [
      h('h1', null, t.appTitle),
      h('nav', { class: 'pagenav' }, h('a', { class: 'graph-link', href: '#/graph' }, t.openGraph + ' →'))
    ]),
    body, featureSection
  ]))
}

// ---- 뷰: 개념 상세 ----
function viewConcept(slug) {
  var entry = conceptEntry(slug)
  if (!entry) return renderMissing()
  var t = state.t
  fetchJson(entry.url).then(function (c) {
    var related = relatedFeatures(slug)
    var sections = [
      h('header', { class: 'hero' }, [
        c.eyebrow ? h('span', { class: 'hero__eyebrow' }, c.eyebrow) : null,
        statusBadge(c.status),
        h('h1', null, c.title),
        h('p', null, c.description.definition),
        h('p', { class: 'cats' }, (c.category || []).join(' · '))
      ]),
      h('section', { class: 'section' }, [
        h('h2', null, t.description),
        h('p', null, c.description.definition),
        c.description.analogy ? h('p', { class: 'analogy' }, c.description.analogy) : null,
        ul(c.description.components)
      ]),
      h('section', { class: 'section' }, [
        h('h2', null, t.purpose), h('p', null, c.purpose.reason), ul(c.purpose.benefits)
      ]),
      h('section', { class: 'section cols' }, [
        h('div', { class: 'col-card col-card--allow' }, [h('h3', null, t.allow), ul(c.actions.allow)]),
        h('div', { class: 'col-card col-card--restrict' }, [h('h3', null, t.restrict), ul(c.actions.restrict)])
      ]),
      h('section', { class: 'section' }, [
        h('h2', null, t.principle), ul(c.principle.immutableRules),
        c.principle.tradeoffs ? h('p', null, c.principle.tradeoffs) : null
      ]),
      related.length
        ? h('section', { class: 'section' }, [
            h('h2', null, t.relatedFeatures),
            h('ul', { class: 'links' }, related.map(function (f) {
              return h('li', null, h('a', { href: '#/feature/' + f.slug }, f.title))
            }))
          ])
        : null,
      pagenav()
    ]
    setApp(h('div', { class: 'wrap' }, sections))
  }).catch(renderError)
}

// ---- 뷰: 기능 상세 ----
function viewFeature(slug) {
  var entry = featureEntry(slug)
  if (!entry) return renderMissing()
  var t = state.t
  fetchJson(entry.url).then(function (f) {
    var conceptLinks = (f.concepts || []).map(function (cs) {
      var e = conceptEntry(cs)
      return e
        ? h('li', null, h('a', { href: '#/concept/' + cs }, e.title))
        : h('li', null, h('span', { class: 'muted' }, cs))
    })
    var paths = (f.codePaths || []).length
      ? h('ul', { class: 'paths' }, f.codePaths.map(function (p) { return h('li', null, h('code', null, p)) }))
      : null
    setApp(h('div', { class: 'wrap' }, [
      h('header', { class: 'hero' }, [
        h('span', { class: 'hero__eyebrow' }, t.featureEyebrow),
        h('h1', null, f.title),
        f.description ? h('p', null, f.description) : null
      ]),
      h('section', { class: 'section' }, [
        h('h2', null, t.relatedConcepts), h('ul', { class: 'links' }, conceptLinks)
      ]),
      h('section', { class: 'section' }, [h('h2', null, t.implementationPaths), paths]),
      pagenav()
    ]))
  }).catch(renderError)
}

// ---- 뷰: 지식 그래프 ----
function viewGraph() {
  var t = state.t
  var data = (state.manifest.graph) || { nodes: [], edges: [] }
  var legend = h('span', { class: 'legend' }, [
    h('span', { class: 'lg' }, [h('i', { class: 'dot dot--concept' }), t.conceptNode]),
    h('span', { class: 'lg' }, [h('i', { class: 'dot dot--feature' }), t.featureNode]),
    h('span', { class: 'lg' }, [h('i', { class: 'dot dot--file' }), t.fileNode])
  ])
  var svg = h('svg', { id: 'graph', class: 'graph' })
  setApp(h('div', { class: 'graph-shell' }, [
    h('header', { class: 'graph-bar' }, [
      h('a', { class: 'back', href: '#/' }, '← ' + t.back),
      h('strong', null, t.graphTitle), legend
    ]),
    svg
  ]), { graph: true })
  renderGraph(svg, data, ++renderGen)
}

// 의존성 없는 force-directed 시뮬레이션. 라벨은 textContent로만 설정한다.
function renderGraph(svg, data, gen) {
  var NS = 'http://www.w3.org/2000/svg'
  function size() { return { w: svg.clientWidth || window.innerWidth, h: svg.clientHeight || (window.innerHeight - 56) } }
  var dim = size(), W = dim.w, H = dim.h
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H)
  var n = data.nodes.length || 1
  var nodes = data.nodes.map(function (d, i) {
    var a = i / n * Math.PI * 2, R = Math.min(W, H) * 0.32
    return { id: d.id, label: d.label, type: d.type, href: d.href, title: d.title,
      x: W / 2 + Math.cos(a) * R, y: H / 2 + Math.sin(a) * R, vx: 0, vy: 0, fixed: false, drag: false }
  })
  var byId = {}; nodes.forEach(function (d) { byId[d.id] = d })
  var edges = data.edges.map(function (e) { return { s: byId[e.source], t: byId[e.target] } })
    .filter(function (e) { return e.s && e.t })
  var gE = h('g'); svg.appendChild(gE)
  var gN = h('g'); svg.appendChild(gN)
  var lines = edges.map(function () { var l = document.createElementNS(NS, 'line'); l.setAttribute('class', 'gedge'); gE.appendChild(l); return l })
  function toLocal(ev) { var r = svg.getBoundingClientRect(); return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H } }
  var groups = nodes.map(function (d) {
    var g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'gnode gnode--' + d.type)
    var c = document.createElementNS(NS, 'circle'); c.setAttribute('r', d.type === 'file' ? 5 : 9); g.appendChild(c)
    var tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', 13); tx.setAttribute('y', 4); tx.textContent = d.label; g.appendChild(tx)
    var tt = document.createElementNS(NS, 'title'); tt.textContent = d.title || d.label; g.appendChild(tt)
    g.addEventListener('mousedown', function (ev) {
      ev.preventDefault(); d.fixed = true; d.drag = false
      function mv(e2) { var p = toLocal(e2); d.x = p.x; d.y = p.y; d.drag = true }
      function up() { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); setTimeout(function () { d.drag = false }, 0) }
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
    })
    if (d.href) { g.style.cursor = 'pointer'; g.addEventListener('click', function () { if (!d.drag) window.location.hash = d.href.replace(/^#/, '') }) }
    gN.appendChild(g); return g
  })
  function tick() {
    if (gen !== renderGen) return // 라우트가 바뀌면 루프 종료
    for (var i = 0; i < nodes.length; i++) for (var j = i + 1; j < nodes.length; j++) {
      var a = nodes[i], b = nodes[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 0.01, dd = Math.sqrt(d2), f = 2600 / d2
      a.vx += dx / dd * f; a.vy += dy / dd * f; b.vx -= dx / dd * f; b.vy -= dy / dd * f
    }
    edges.forEach(function (e) {
      var dx = e.t.x - e.s.x, dy = e.t.y - e.s.y, dd = Math.sqrt(dx * dx + dy * dy) + 0.01, f = (dd - 96) * 0.02
      e.s.vx += dx / dd * f; e.s.vy += dy / dd * f; e.t.vx -= dx / dd * f; e.t.vy -= dy / dd * f
    })
    nodes.forEach(function (d) {
      d.vx += (W / 2 - d.x) * 0.002; d.vy += (H / 2 - d.y) * 0.002; d.vx *= 0.85; d.vy *= 0.85
      if (!d.fixed) { d.x += d.vx; d.y += d.vy }
      d.x = Math.max(24, Math.min(W - 24, d.x)); d.y = Math.max(24, Math.min(H - 24, d.y))
    })
    lines.forEach(function (l, i) { var e = edges[i]; l.setAttribute('x1', e.s.x); l.setAttribute('y1', e.s.y); l.setAttribute('x2', e.t.x); l.setAttribute('y2', e.t.y) })
    groups.forEach(function (g, i) { g.setAttribute('transform', 'translate(' + nodes[i].x + ',' + nodes[i].y + ')') })
    requestAnimationFrame(tick)
  }
  if (data.nodes.length) requestAnimationFrame(tick)
}

// ---- 에러/미발견 ----
function renderError() {
  renderGen++
  setApp(h('div', { class: 'wrap' }, [h('p', { class: 'muted' }, state.t.loadError), pagenav()]))
}
function renderMissing() {
  renderGen++
  setApp(h('div', { class: 'wrap' }, [h('p', { class: 'muted' }, state.t.notFound), pagenav()]))
}

// ---- 라우터 ----
function route() {
  renderGen++ // 이전 그래프 루프 중단
  var hash = window.location.hash.replace(/^#/, '') || '/'
  var parts = hash.split('/').filter(Boolean) // ['concept','slug'] 등
  if (parts[0] === 'concept' && parts[1]) return viewConcept(decodeURIComponent(parts[1]))
  if (parts[0] === 'feature' && parts[1]) return viewFeature(decodeURIComponent(parts[1]))
  if (parts[0] === 'graph') return viewGraph()
  return viewIndex()
}

function boot() {
  fetchJson('manifest.json').then(function (m) {
    state.manifest = m
    state.t = I18N[m.locale] || I18N.ko
    document.documentElement.lang = m.locale || 'ko'
    window.addEventListener('hashchange', route)
    route()
  }).catch(function () {
    var app = document.getElementById('app')
    app.textContent = ''
    app.appendChild(h('div', { class: 'wrap' }, h('p', { class: 'muted' }, I18N.ko.loadError)))
  })
}

boot()
