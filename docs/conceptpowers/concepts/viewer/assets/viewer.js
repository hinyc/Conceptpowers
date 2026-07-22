// assets/viewer.js — Conceptpowers 단일 뷰어(SPA). 의존성 0.
// manifest.json을 읽고, 개념/기능 본문은 원본 data/*.json을 fetch해 렌더한다.
// 해시 라우트: #/ (목록) · #/concept/:slug · #/feature/:slug · #/graph(/:focusSlug)
'use strict'

var I18N = {
  ko: {
    appTitle: '개념 목록', description: '설명', purpose: '목적', allow: '허용 행동',
    restrict: '제한 행동', principle: '운영 원칙', conceptList: '개념 목록',
    statusApproved: '승인됨', statusUnapproved: '미승인', statusPending: '보류',
    featureList: '기능 목록', relatedFeatures: '관련 기능', relatedConcepts: '관련 개념',
    implementationPaths: '구현 경로', featureEyebrow: '기능', graphTitle: '지식 그래프',
    openGraph: '지식 그래프 보기', conceptNode: '개념', featureNode: '기능', fileNode: '파일',
    allConcepts: '전체 보기', focusHint: '개념을 선택하면 연관 그래프만 표시됩니다.',
    copyPath: '경로 복사', copied: '복사됨', copyFailed: '복사 실패',
    back: '개념 목록', empty: '아직 개념이 없습니다.', loadError: '데이터를 불러오지 못했습니다.',
    notFound: '대상을 찾을 수 없습니다.',
    edit: '편집', save: '저장', cancel: '취소', setStatus: '상태 변경',
    saved: '저장됨', saveFailed: '저장 실패',
    statusGreen: '승인(green)', statusPending: '보류(pending)', statusRed: '미승인(red)',
    greenSettled: 'green은 정착 상태라 강등할 수 없습니다(사람이 직접 JSON 편집 시에만).',
    downgradedNotice: '내용이 바뀌어 상태가 보류(pending)로 내려갔습니다. 다음 세션에서 일관성 재검토 후 승인됩니다.',
    title: '제목', eyebrow: '윗단 문구', definition: '정의', analogy: '비유',
    components: '구성요소', example: '예시', reason: '이유', benefits: '이점',
    vision: '비전', painPoints: '문제점', interaction: '상호작용', immutableRules: '불변 규칙',
    tradeoffs: '트레이드오프', lifecycle: '생명주기', relatedSlugs: '관련 개념(slug)',
    category: '분류', codeLinksLabel: '코드 경로', linesHint: '한 줄에 하나씩'
  },
  en: {
    appTitle: 'Concepts', description: 'Description', purpose: 'Purpose', allow: 'Allowed',
    restrict: 'Restricted', principle: 'Operating Principles', conceptList: 'Concepts',
    statusApproved: 'Approved', statusUnapproved: 'Unapproved', statusPending: 'Pending',
    featureList: 'Features', relatedFeatures: 'Related Features', relatedConcepts: 'Related Concepts',
    implementationPaths: 'Implementation', featureEyebrow: 'Feature', graphTitle: 'Knowledge Graph',
    openGraph: 'View Knowledge Graph', conceptNode: 'Concept', featureNode: 'Feature', fileNode: 'File',
    allConcepts: 'Show all', focusHint: 'Pick a concept to show only its related graph.',
    copyPath: 'Copy path', copied: 'Copied', copyFailed: 'Copy failed',
    back: 'Concepts', empty: 'No concepts yet.', loadError: 'Failed to load data.',
    notFound: 'Not found.',
    edit: 'Edit', save: 'Save', cancel: 'Cancel', setStatus: 'Change status',
    saved: 'Saved', saveFailed: 'Save failed',
    statusGreen: 'Approve (green)', statusPending: 'Pending', statusRed: 'Unapprove (red)',
    greenSettled: 'green is settled and cannot be demoted (only by editing the JSON directly).',
    downgradedNotice: 'Content changed, so status was lowered to pending. It will be re-approved after a consistency re-check next session.',
    title: 'Title', eyebrow: 'Eyebrow', definition: 'Definition', analogy: 'Analogy',
    components: 'Components', example: 'Example', reason: 'Reason', benefits: 'Benefits',
    vision: 'Vision', painPoints: 'Pain points', interaction: 'Interaction', immutableRules: 'Immutable rules',
    tradeoffs: 'Trade-offs', lifecycle: 'Lifecycle', relatedSlugs: 'Related concepts (slug)',
    category: 'Category', codeLinksLabel: 'Code paths', linesHint: 'one per line'
  }
}

var state = { manifest: null, t: I18N.en, editable: false, editing: false, current: null }
var renderGen = 0 // 라우트가 바뀌면 증가 → 그래프 애니메이션 루프 종료 신호

// 클라이언트가 보여줄 상태 전이(서버 가드의 미러 — 활성/비활성 판단용).
// red→green / pending→green·red 만 허용. green은 정착(버튼 비활성).
var ALLOWED_TRANSITIONS = { red: ['green'], pending: ['green', 'red'], green: [] }

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
// 클립보드 복사. localhost는 보안 컨텍스트라 navigator.clipboard가 동작하지만,
// 안 될 경우 textarea + execCommand로 폴백한다.
function copyText(s) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(s)
  return new Promise(function (res, rej) {
    try {
      var ta = document.createElement('textarea')
      ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.focus(); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta); res()
    } catch (e) { rej(e) }
  })
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
// 쓰기 요청. 실패 시 응답 JSON의 error 메시지를 담아 throw한다.
function sendJson(method, url, body) {
  return fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function (r) {
    return r.json().catch(function () { return {} }).then(function (j) {
      if (!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status))
      return j
    })
  })
}
// 우하단 토스트(텍스트만). 스택 컨테이너에 쌓여 겹치지 않으며 일정 시간 후 사라진다.
function toast(msg, kind) {
  var stack = document.getElementById('toasts')
  if (!stack) { stack = h('div', { id: 'toasts', class: 'toast-stack' }); document.body.appendChild(stack) }
  var el = h('div', { class: 'toast' + (kind ? ' toast--' + kind : '') }, msg)
  stack.appendChild(el)
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el) }, 3200)
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
// fetch는 한 번, 렌더는 읽기/편집 모드로 분리. 모드 토글 시 재fetch 없이 다시 그린다.
function viewConcept(slug) {
  var entry = conceptEntry(slug)
  if (!entry) return renderMissing()
  state.editing = false
  fetchJson(entry.url).then(function (c) {
    state.current = c
    renderConcept(slug)
  }).catch(renderError)
}
// 저장/상태변경 후 manifest+data를 다시 읽어 목록 배지까지 최신화한 뒤 재렌더.
function reloadConcept(slug) {
  return fetchJson('manifest.json').then(function (m) {
    state.manifest = m
    var entry = conceptEntry(slug)
    if (!entry) return renderMissing()
    return fetchJson(entry.url).then(function (c) { state.current = c; renderConcept(slug) })
  })
}
function renderConcept(slug) {
  if (state.editing) return renderConceptEdit(slug)
  return renderConceptRead(slug)
}

// 상태 전이 컨트롤: 허용 전이만 활성. green은 비활성(정착) + 사유 툴팁.
function statusControl(slug, c) {
  var t = state.t
  var allowed = ALLOWED_TRANSITIONS[c.status] || []
  var defs = [['green', t.statusGreen], ['pending', t.statusPending], ['red', t.statusRed]]
  var btns = defs.map(function (d) {
    var target = d[0]
    var isCurrent = target === c.status
    var canDo = allowed.indexOf(target) !== -1
    var attrs = { type: 'button', class: 'st-btn st-btn--' + target + (isCurrent ? ' st-btn--current' : '') }
    if (!canDo || isCurrent) attrs.disabled = 'disabled'
    if (c.status === 'green' && !isCurrent) attrs.title = t.greenSettled
    var btn = h('button', attrs, d[1])
    if (canDo && !isCurrent) {
      btn.addEventListener('click', function () {
        sendJson('POST', '/api/concept/' + encodeURIComponent(slug) + '/status', { status: target })
          .then(function () { toast(t.saved, 'ok'); return reloadConcept(slug) })
          .catch(function (e) { toast(t.saveFailed + ': ' + e.message, 'err') })
      })
    }
    return btn
  })
  return h('div', { class: 'st-ctrl' }, [h('span', { class: 'st-ctrl__label' }, t.setStatus + ':')].concat(btns))
}

// 읽기 모드.
function renderConceptRead(slug) {
  var t = state.t
  var c = state.current
  var entry = conceptEntry(slug)
  var related = relatedFeatures(slug)
  var codeLinks = (entry && entry.codeLinks) || []
  var editBar = state.editable
    ? h('div', { class: 'edit-bar' }, [
        statusControl(slug, c),
        h('button', { type: 'button', class: 'edit-btn' }, t.edit)
      ])
    : null
  if (editBar) {
    editBar.querySelector('.edit-btn').addEventListener('click', function () {
      state.editing = true; renderConcept(slug)
    })
  }
  var sections = [
    h('header', { class: 'hero' }, [
      c.eyebrow ? h('span', { class: 'hero__eyebrow' }, c.eyebrow) : null,
      statusBadge(c.status),
      h('h1', null, c.title),
      h('p', null, c.description.definition),
      h('p', { class: 'cats' }, (c.category || []).join(' · '))
    ]),
    editBar,
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
    codeLinks.length
      ? h('section', { class: 'section' }, [
          h('h2', null, t.implementationPaths),
          h('ul', { class: 'paths' }, codeLinks.map(function (p) {
            return h('li', null, h('code', null, p))
          }))
        ])
      : null,
    h('nav', { class: 'pagenav' }, [
      h('a', { href: '#/' }, t.conceptList), ' · ',
      h('a', { class: 'graph-link', href: '#/graph/' + slug }, t.openGraph + ' →')
    ])
  ]
  setApp(h('div', { class: 'wrap' }, sections))
}

// ---- 편집 폼 헬퍼 ----
var CATEGORIES = ['feature', 'behavior', 'role', 'permission', 'term']
function toLines(str) { return String(str || '').split('\n').map(function (s) { return s.trim() }).filter(Boolean) }
function linesOf(arr) { return (arr || []).join('\n') }
// label + 컨트롤 행. ctrl은 input/textarea 노드. 반환: { row, ctrl }
function field(labelText, ctrl, hint) {
  return h('label', { class: 'fld' }, [
    h('span', { class: 'fld__label' }, labelText + (hint ? ' (' + hint + ')' : '')),
    ctrl
  ])
}
function input(value) { var n = h('input', { type: 'text', class: 'fld__in' }); n.value = value || ''; return n }
function area(value, rows) { var n = h('textarea', { class: 'fld__ta', rows: String(rows || 3) }); n.value = value || ''; return n }

// 편집 모드: 화이트리스트 필드만 폼으로. 저장 시 섹션 전체를 patch로 보낸다.
function renderConceptEdit(slug) {
  var t = state.t
  var c = state.current
  var f = {}
  f.title = input(c.title)
  f.eyebrow = input(c.eyebrow)
  var catBox = h('div', { class: 'cats-pick' }, CATEGORIES.map(function (cat) {
    var cb = h('input', { type: 'checkbox', value: cat })
    if ((c.category || []).indexOf(cat) !== -1) cb.checked = true
    f['cat_' + cat] = cb
    return h('label', { class: 'cat-pick' }, [cb, ' ' + cat])
  }))
  f.definition = area(c.description.definition, 3)
  f.analogy = area(c.description.analogy, 2)
  f.components = area(linesOf(c.description.components), 3)
  f.example = area(c.description.example, 2)
  f.reason = area(c.purpose.reason, 3)
  f.benefits = area(linesOf(c.purpose.benefits), 3)
  f.vision = area(c.purpose.vision, 2)
  f.painPoints = area(linesOf(c.purpose.painPoints), 3)
  f.allow = area(linesOf(c.actions.allow), 3)
  f.restrict = area(linesOf(c.actions.restrict), 3)
  f.interaction = area(c.actions.interaction, 2)
  f.immutableRules = area(linesOf(c.principle.immutableRules), 3)
  f.tradeoffs = area(c.principle.tradeoffs, 2)
  f.lifecycle = area(linesOf(c.principle.lifecycle), 3)
  f.prev = input(c.relations.prev)
  f.next = input(c.relations.next)
  f.related = area(linesOf(c.relations.related), 2)
  f.codeLinks = area(linesOf(c.codeLinks), 3)

  function collect() {
    var category = CATEGORIES.filter(function (cat) { return f['cat_' + cat].checked })
    return {
      title: f.title.value.trim(),
      eyebrow: f.eyebrow.value.trim(),
      category: category,
      description: {
        definition: f.definition.value.trim(), analogy: f.analogy.value.trim(),
        components: toLines(f.components.value), example: f.example.value.trim()
      },
      purpose: {
        reason: f.reason.value.trim(), benefits: toLines(f.benefits.value),
        vision: f.vision.value.trim(), painPoints: toLines(f.painPoints.value)
      },
      actions: {
        allow: toLines(f.allow.value), restrict: toLines(f.restrict.value),
        interaction: f.interaction.value.trim()
      },
      principle: {
        immutableRules: toLines(f.immutableRules.value), tradeoffs: f.tradeoffs.value.trim(),
        lifecycle: toLines(f.lifecycle.value)
      },
      relations: { prev: f.prev.value.trim(), next: f.next.value.trim(), related: toLines(f.related.value) },
      codeLinks: toLines(f.codeLinks.value)
    }
  }

  var saveBtn = h('button', { type: 'button', class: 'edit-btn edit-btn--save' }, t.save)
  var cancelBtn = h('button', { type: 'button', class: 'edit-btn' }, t.cancel)
  saveBtn.addEventListener('click', function () {
    var patch = collect()
    if (!patch.category.length) { toast(t.saveFailed + ': category', 'err'); return }
    if (!patch.description.definition) { toast(t.saveFailed + ': ' + t.definition, 'err'); return }
    if (!patch.purpose.reason) { toast(t.saveFailed + ': ' + t.reason, 'err'); return }
    var wasGreen = c.status === 'green'
    saveBtn.disabled = 'disabled'
    sendJson('PUT', '/api/concept/' + encodeURIComponent(slug), { patch: patch })
      .then(function () {
        // green→pending 강등 시엔 안내를 합쳐 한 토스트로(겹침 방지), 아니면 저장 완료만.
        if (wasGreen) toast(t.saved + ' — ' + t.downgradedNotice, 'warn')
        else toast(t.saved, 'ok')
        state.editing = false; return reloadConcept(slug)
      })
      .catch(function (e) { saveBtn.disabled = null; toast(t.saveFailed + ': ' + e.message, 'err') })
  })
  cancelBtn.addEventListener('click', function () { state.editing = false; renderConcept(slug) })

  setApp(h('div', { class: 'wrap' }, [
    h('header', { class: 'hero' }, [statusBadge(c.status), h('h1', null, c.title)]),
    h('div', { class: 'edit-bar' }, [saveBtn, cancelBtn]),
    h('section', { class: 'section edit-form' }, [
      field(t.title, f.title), field(t.eyebrow, f.eyebrow),
      field(t.category, catBox),
      h('h2', null, t.description),
      field(t.definition, f.definition), field(t.analogy, f.analogy),
      field(t.components, f.components, t.linesHint), field(t.example, f.example),
      h('h2', null, t.purpose),
      field(t.reason, f.reason), field(t.benefits, f.benefits, t.linesHint),
      field(t.vision, f.vision), field(t.painPoints, f.painPoints, t.linesHint),
      h('h2', null, t.allow + ' / ' + t.restrict),
      field(t.allow, f.allow, t.linesHint), field(t.restrict, f.restrict, t.linesHint),
      field(t.interaction, f.interaction),
      h('h2', null, t.principle),
      field(t.immutableRules, f.immutableRules, t.linesHint), field(t.tradeoffs, f.tradeoffs),
      field(t.lifecycle, f.lifecycle, t.linesHint),
      h('h2', null, t.relatedConcepts),
      field('prev', f.prev), field('next', f.next), field(t.relatedSlugs, f.related, t.linesHint),
      field(t.codeLinksLabel, f.codeLinks, t.linesHint)
    ]),
    h('nav', { class: 'pagenav' }, [h('a', { href: '#/' }, t.conceptList)])
  ]))
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

// 선택한 개념의 1-hop 이웃만 추린다: 개념 자신 + 그 개념을 실현하는 기능 +
// 개념·기능이 가리키는 파일 + (맥락용) 그 기능들이 함께 실현하는 다른 개념(잎 노드).
function subgraphFor(data, slug) {
  var focusId = 'c:' + slug
  var keep = {}; keep[focusId] = true
  var feats = {}
  data.edges.forEach(function (e) {
    if (e.kind === 'feature-concept' && e.target === focusId) { keep[e.source] = true; feats[e.source] = true }
    if (e.kind === 'concept-file' && e.source === focusId) keep[e.target] = true
  })
  data.edges.forEach(function (e) {
    if (!feats[e.source]) return
    if (e.kind === 'feature-file') keep[e.target] = true // 기능→코드
    if (e.kind === 'feature-concept') keep[e.target] = true // 형제 개념(맥락 잎)
  })
  return {
    nodes: data.nodes.filter(function (n) { return keep[n.id] }),
    edges: data.edges.filter(function (e) { return keep[e.source] && keep[e.target] })
  }
}

// 개념 선택 드롭다운: 변경 시 #/graph/<slug> 로 이동(전체 보기는 __all).
function focusSelect(concepts, value) {
  var t = state.t
  var sel = h('select', { class: 'graph-focus', 'aria-label': t.conceptNode })
  sel.appendChild(h('option', { value: '__all' }, t.allConcepts))
  concepts.forEach(function (c) { sel.appendChild(h('option', { value: c.slug }, c.title)) })
  sel.value = value
  sel.addEventListener('change', function () { window.location.hash = '/graph/' + sel.value })
  return sel
}

// ---- 뷰: 지식 그래프 ----
// focusSlug: 개념 slug면 그 이웃만, '__all'이면 전체, 없으면 첫 개념을 기본 포커스.
function viewGraph(focusSlug) {
  var t = state.t
  var full = (state.manifest.graph) || { nodes: [], edges: [] }
  var concepts = state.manifest.concepts || []
  var isAll = focusSlug === '__all'
  var effective = isAll ? null
    : (focusSlug || (concepts.length ? concepts[0].slug : null))
  var data = effective ? subgraphFor(full, effective) : full
  var legend = h('span', { class: 'legend' }, [
    h('span', { class: 'lg' }, [h('i', { class: 'dot dot--concept' }), t.conceptNode]),
    h('span', { class: 'lg' }, [h('i', { class: 'dot dot--feature' }), t.featureNode]),
    h('span', { class: 'lg' }, [h('i', { class: 'dot dot--file' }), t.fileNode])
  ])
  var svg = h('svg', { id: 'graph', class: 'graph' })
  setApp(h('div', { class: 'graph-shell' }, [
    h('header', { class: 'graph-bar' }, [
      h('a', { class: 'back', href: '#/' }, '← ' + t.back),
      h('strong', null, t.graphTitle),
      concepts.length ? focusSelect(concepts, effective || '__all') : null,
      legend
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

  // 파일 노드 호버 툴팁: 전체 경로 + 경로 복사 버튼. graph-shell 안에 두어 라우트 전환 시 함께 제거된다.
  var tip = buildFileTip(svg, W, H)

  var groups = nodes.map(function (d) {
    var g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'gnode gnode--' + d.type)
    var c = document.createElementNS(NS, 'circle'); c.setAttribute('r', d.type === 'file' ? 5 : 9); g.appendChild(c)
    var tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', 13); tx.setAttribute('y', 4); tx.textContent = d.label; g.appendChild(tx)
    // 파일 노드는 커스텀 툴팁이 경로를 보여주므로 네이티브 <title>은 개념·기능에만 둔다.
    if (d.type !== 'file') { var tt = document.createElementNS(NS, 'title'); tt.textContent = d.title || d.label; g.appendChild(tt) }
    g.addEventListener('mousedown', function (ev) {
      ev.preventDefault(); d.fixed = true; d.drag = false
      function mv(e2) { var p = toLocal(e2); d.x = p.x; d.y = p.y; d.drag = true }
      function up() { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); setTimeout(function () { d.drag = false }, 0) }
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
    })
    if (d.type === 'file') {
      g.addEventListener('mouseenter', function () { tip.show(d) })
      g.addEventListener('mouseleave', function () { tip.scheduleHide() })
    }
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
    tip.reposition() // 노드가 움직이는 동안 툴팁을 따라붙인다
    requestAnimationFrame(tick)
  }
  if (data.nodes.length) requestAnimationFrame(tick)
}

// 파일 노드 호버 툴팁 빌더: 전체 경로 표시 + 경로 복사 버튼. 노드 좌표(뷰박스 W×H)를
// 화면 좌표로 변환해 fixed 위치에 띄우고, 노드↔툴팁 사이 이동을 허용하도록 지연 숨김한다.
function buildFileTip(svg, W, H) {
  var el = document.createElement('div'); el.className = 'gtip'; el.style.display = 'none'
  var pathEl = document.createElement('span'); pathEl.className = 'gtip__path'
  var copyBtn = document.createElement('button'); copyBtn.type = 'button'; copyBtn.className = 'gtip__copy'
  copyBtn.textContent = state.t.copyPath
  el.appendChild(copyBtn); el.appendChild(pathEl) // 복사 버튼을 경로 좌측에 둔다
  ;(svg.parentNode || document.body).appendChild(el)

  var active = null, hideTimer = null, btnTimer = null
  function place() {
    if (!active) return
    var r = svg.getBoundingClientRect()
    el.style.left = (r.left + active.x / W * r.width + 12) + 'px'
    el.style.top = (r.top + active.y / H * r.height - 8) + 'px'
  }
  function hide() { active = null; el.style.display = 'none' }
  function clearHide() { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null } }
  function flashBtn(label) {
    copyBtn.textContent = label
    if (btnTimer) clearTimeout(btnTimer)
    btnTimer = setTimeout(function () { copyBtn.textContent = state.t.copyPath }, 1200)
  }
  copyBtn.addEventListener('click', function () {
    copyText(pathEl.textContent)
      .then(function () { flashBtn(state.t.copied) })
      .catch(function () { flashBtn(state.t.copyFailed) })
  })
  el.addEventListener('mouseenter', clearHide)
  el.addEventListener('mouseleave', hide)
  return {
    show: function (d) {
      clearHide(); active = d; pathEl.textContent = d.title
      copyBtn.textContent = state.t.copyPath; el.style.display = 'flex'; place()
    },
    scheduleHide: function () { clearHide(); hideTimer = setTimeout(hide, 180) },
    reposition: function () { if (active) place() }
  }
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
  if (parts[0] === 'graph') return viewGraph(parts[1] ? decodeURIComponent(parts[1]) : null)
  return viewIndex()
}

// 편집 가능 여부 감지: 쓰기 서버(serve.mjs)면 /api/health가 응답한다.
// 정적 배포(서버 없음)면 실패 → 읽기 전용으로 동작.
function detectEditable() {
  return fetch('/api/health', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null })
    .then(function (j) { state.editable = !!(j && j.editable) })
    .catch(function () { state.editable = false })
}

function boot() {
  Promise.all([fetchJson('manifest.json'), detectEditable()]).then(function (res) {
    var m = res[0]
    state.manifest = m
    // UI 문구는 기본 영어. 개념/기능 본문(data/*.json)은 작성된 언어 그대로 렌더되며,
    // UI 언어만 바꾸려면 manifest의 uiLocale(예: 'ko')을 지정한다.
    state.t = I18N[m.uiLocale] || I18N.en
    document.documentElement.lang = m.locale || 'en'
    window.addEventListener('hashchange', route)
    route()
  }).catch(function () {
    var app = document.getElementById('app')
    app.textContent = ''
    app.appendChild(h('div', { class: 'wrap' }, h('p', { class: 'muted' }, I18N.en.loadError)))
  })
}

boot()
