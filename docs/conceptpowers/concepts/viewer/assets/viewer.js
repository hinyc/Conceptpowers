// @concept:home-search @concept:knowledge-graph-view @concept:concept-inline-edit @concept:copy-code-path @concept:settled-status @concept:list-item-readout
// assets/viewer.js — Conceptpowers 단일 뷰어(SPA). 의존성 0.
// manifest.json을 읽고, 개념/기능 본문은 원본 data/*.json을 fetch해 렌더한다.
// 해시 라우트: #/ (목록) · #/group/:g (목록의 그룹 위치) · #/concept/:slug · #/feature/:slug · #/graph(/:focusSlug)
'use strict';

var I18N = {
  ko: {
    appTitle: '개념 목록',
    description: '설명',
    purpose: '목적',
    allow: '허용 행동',
    restrict: '제한 행동',
    principle: '운영 원칙',
    conceptList: '개념 목록',
    colStatus: '상태',
    colCode: '코드',
    colTitle: '제목',
    colGroup: '묶음',
    statusApproved: '승인됨',
    statusUnapproved: '미승인',
    statusPending: '보류',
    featureList: '기능 목록',
    relatedFeatures: '관련 기능',
    relatedConcepts: '관련 개념',
    implementationPaths: '구현 경로',
    featureEyebrow: '기능',
    graphTitle: '지식 그래프',
    openGraph: '지식 그래프 보기',
    conceptNode: '개념',
    featureNode: '기능',
    fileNode: '파일',
    allConcepts: '전체 보기',
    focusHint: '개념을 선택하면 연관 그래프만 표시됩니다.',
    copyPath: '경로 복사',
    copied: '복사됨',
    copyFailed: '복사 실패',
    home: '홈',
    fitWidth: '폭맞춤',
    fitPage: '쪽맞춤',
    zoomLabel: '배율',
    searchPh: '검색 — 개념 · 기능 · 파일 경로(@concept 색인)',
    noResults: '검색 결과가 없습니다.',
    fileResults: '파일 (@concept 색인)',
    architecture: '아키텍처',
    infra: '인프라',
    docEmpty: '아직 작성되지 않았습니다 — 이 문서는 사용자가 직접 채웁니다.',
    back: '개념 목록',
    empty: '아직 개념이 없습니다.',
    loadError: '데이터를 불러오지 못했습니다.',
    notFound: '대상을 찾을 수 없습니다.',
    edit: '편집',
    save: '저장',
    cancel: '취소',
    setStatus: '상태 변경',
    saved: '저장됨',
    saveFailed: '저장 실패',
    statusGreen: '승인(green)',
    statusYellow: '보류(pending)',
    statusRed: '미승인(red)',
    greenSettled: 'green은 정착 상태라 강등할 수 없습니다(사람이 직접 JSON 편집 시에만).',
    downgradedNotice:
      '내용이 바뀌어 상태가 보류(pending)로 내려갔습니다. 다음 세션에서 일관성 재검토 후 승인됩니다.',
    title: '제목',
    eyebrow: '윗단 문구',
    definition: '정의',
    analogy: '비유',
    components: '구성요소',
    example: '예시',
    reason: '이유',
    benefits: '이점',
    vision: '비전',
    painPoints: '문제점',
    interaction: '상호작용',
    immutableRules: '불변 규칙',
    tradeoffs: '트레이드오프',
    lifecycle: '생명주기',
    relatedSlugs: '관련 개념(slug)',
    category: '분류',
    codeLinksLabel: '코드 경로',
    linesHint: '한 줄에 하나씩',
    sidebarOpenLabel: '개념 목록 열기',
    sidebarCloseLabel: '개념 목록 닫기',
    closeSidebar: '닫기',
    sidebarSearchPh: '개념 · 기능 검색',
  },
  en: {
    appTitle: 'Concepts',
    description: 'Description',
    purpose: 'Purpose',
    allow: 'Allowed',
    restrict: 'Restricted',
    principle: 'Operating Principles',
    conceptList: 'Concepts',
    colStatus: 'Status',
    colCode: 'Code',
    colTitle: 'Title',
    colGroup: 'Group',
    statusApproved: 'Approved',
    statusUnapproved: 'Unapproved',
    statusPending: 'Pending',
    featureList: 'Features',
    relatedFeatures: 'Related Features',
    relatedConcepts: 'Related Concepts',
    implementationPaths: 'Implementation',
    featureEyebrow: 'Feature',
    graphTitle: 'Knowledge Graph',
    openGraph: 'View Knowledge Graph',
    conceptNode: 'Concept',
    featureNode: 'Feature',
    fileNode: 'File',
    allConcepts: 'Show all',
    focusHint: 'Pick a concept to show only its related graph.',
    copyPath: 'Copy path',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    home: 'Home',
    fitWidth: 'Fit width',
    fitPage: 'Fit page',
    zoomLabel: 'Zoom',
    searchPh: 'Search — concepts · features · file paths (@concept index)',
    noResults: 'No results.',
    fileResults: 'Files (@concept index)',
    architecture: 'Architecture',
    infra: 'Infrastructure',
    docEmpty: 'Not written yet — this document is user-authored.',
    back: 'Concepts',
    empty: 'No concepts yet.',
    loadError: 'Failed to load data.',
    notFound: 'Not found.',
    edit: 'Edit',
    save: 'Save',
    cancel: 'Cancel',
    setStatus: 'Change status',
    saved: 'Saved',
    saveFailed: 'Save failed',
    statusGreen: 'Approve (green)',
    statusYellow: 'Pending',
    statusRed: 'Unapprove (red)',
    greenSettled: 'green is settled and cannot be demoted (only by editing the JSON directly).',
    downgradedNotice:
      'Content changed, so status was lowered to pending. It will be re-approved after a consistency re-check next session.',
    title: 'Title',
    eyebrow: 'Eyebrow',
    definition: 'Definition',
    analogy: 'Analogy',
    components: 'Components',
    example: 'Example',
    reason: 'Reason',
    benefits: 'Benefits',
    vision: 'Vision',
    painPoints: 'Pain points',
    interaction: 'Interaction',
    immutableRules: 'Immutable rules',
    tradeoffs: 'Trade-offs',
    lifecycle: 'Lifecycle',
    relatedSlugs: 'Related concepts (slug)',
    category: 'Category',
    codeLinksLabel: 'Code paths',
    linesHint: 'one per line',
    sidebarOpenLabel: 'Open concept list',
    sidebarCloseLabel: 'Close concept list',
    closeSidebar: 'Close',
    sidebarSearchPh: 'Search concepts · features',
  },
};

var state = { manifest: null, t: I18N.en, editable: false, editing: false, current: null };
var renderGen = 0; // 라우트가 바뀌면 증가 → 그래프 애니메이션 루프 종료 신호

// 클라이언트가 보여줄 상태 전이(서버 가드의 미러 — 활성/비활성 판단용).
// red→green / pending→green·red 만 허용. green은 정착(버튼 비활성).
var ALLOWED_TRANSITIONS = { red: ['green'], pending: ['green', 'red'], green: [] };

// ---- DOM 헬퍼: 텍스트는 textContent로만 넣어 XSS를 차단한다 ----
function h(tag, attrs, children) {
  var node = document.createElementNS(
    tag === 'svg' || tag === 'g' ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml',
    tag
  );
  if (attrs) {
    for (var k in attrs) {
      if (attrs[k] == null) continue;
      if (k === 'class') node.setAttribute('class', attrs[k]);
      else if (k === 'href') node.setAttribute('href', attrs[k]);
      else node.setAttribute(k, attrs[k]);
    }
  }
  append(node, children);
  return node;
}
function append(node, children) {
  if (children == null) return;
  if (Array.isArray(children)) {
    children.forEach(function (c) {
      append(node, c);
    });
  } else if (typeof children === 'string' || typeof children === 'number') {
    node.appendChild(document.createTextNode(String(children)));
  } else {
    node.appendChild(children);
  }
}
function ul(items, cls) {
  if (!items || !items.length) return null;
  return h(
    'ul',
    cls ? { class: cls } : null,
    items.map(function (i) {
      return h('li', null, i);
    })
  );
}
function statusLabel(status) {
  var t = state.t;
  return status === 'green'
    ? t.statusApproved
    : status === 'pending'
      ? t.statusPending
      : t.statusUnapproved;
}
// 상세 화면(hero)용 알약형 배지. 목록은 글자 없이 동그라미(statusDot)만 쓴다.
function statusBadge(status) {
  return h('span', { class: 'badge badge--' + (status || 'red') }, statusLabel(status));
}
// 목록·사이드바용 축약 표시: 글자 없이 상태색 동그라미 하나만 둔다.
// 색만으로는 뜻이 전달되지 않으므로 (a) 각 아이콘에 title/aria-label을 달고
// (b) 목록 화면 우측 상단에 색-상태 범례(statusLegend)를 함께 띄운다.
function statusDot(status) {
  var label = statusLabel(status);
  return h('span', {
    class: 'status-dot status-dot--' + (status || 'red'),
    role: 'img',
    'aria-label': label,
    title: label,
  });
}
// 색-상태 범례. 아이콘만 쓰는 목록 화면에서 색의 뜻을 한 번 알려준다.
function statusLegend() {
  return h(
    'div',
    { class: 'status-legend' },
    ['green', 'pending', 'red'].map(function (s) {
      return h('span', { class: 'status-legend__item' }, [statusDot(s), statusLabel(s)]);
    })
  );
}
// 클립보드 복사. localhost는 보안 컨텍스트라 navigator.clipboard가 동작하지만,
// 안 될 경우 textarea + execCommand로 폴백한다.
function copyText(s) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(s);
  return new Promise(function (res, rej) {
    try {
      var ta = document.createElement('textarea');
      ta.value = s;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      res();
    } catch (e) {
      rej(e);
    }
  });
}
function setApp(node, opts) {
  document.body.className = opts && opts.graph ? 'viewing-graph' : '';
  var app = document.getElementById('app');
  app.textContent = '';
  app.appendChild(node);
}
function pagenav() {
  var t = state.t;
  return h('nav', { class: 'pagenav' }, [
    h('a', { href: '#/' }, t.conceptList),
    ' · ',
    h('a', { href: '#/graph' }, t.graphTitle),
  ]);
}
// 경로 내비게이션. items: [{label, href?}] — 마지막(또는 href 없는 항목)은 현재 위치로 표시.
function breadcrumbs(items) {
  var kids = [];
  items.forEach(function (it, i) {
    if (i) kids.push(h('span', { class: 'crumb-sep' }, '›'));
    kids.push(
      it.href
        ? h('a', { class: 'crumb', href: it.href }, it.label)
        : h('span', { class: 'crumb crumb--current' }, it.label)
    );
  });
  return h('nav', { class: 'crumbs' }, kids);
}

// ---- 데이터 ----
function fetchJson(url) {
  return fetch(url, { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
    return r.json();
  });
}
// 쓰기 요청. 실패 시 응답 JSON의 error 메시지를 담아 throw한다.
function sendJson(method, url, body) {
  return fetch(url, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(function (r) {
    return r
      .json()
      .catch(function () {
        return {};
      })
      .then(function (j) {
        if (!r.ok) throw new Error((j && j.error) || 'HTTP ' + r.status);
        return j;
      });
  });
}
// 우하단 토스트(텍스트만). 스택 컨테이너에 쌓여 겹치지 않으며 일정 시간 후 사라진다.
function toast(msg, kind) {
  var stack = document.getElementById('toasts');
  if (!stack) {
    stack = h('div', { id: 'toasts', class: 'toast-stack' });
    document.body.appendChild(stack);
  }
  var el = h('div', { class: 'toast' + (kind ? ' toast--' + kind : '') }, msg);
  stack.appendChild(el);
  setTimeout(function () {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 3200);
}

function conceptEntry(slug) {
  return (
    (state.manifest.concepts || []).filter(function (c) {
      return c.slug === slug;
    })[0] || null
  );
}
function featureEntry(slug) {
  return (
    (state.manifest.features || []).filter(function (f) {
      return f.slug === slug;
    })[0] || null
  );
}
function conceptTitle(slug) {
  var e = conceptEntry(slug);
  return e ? e.title : slug;
}
// 표시명: 제목이 slug(개념 코드)와 다르면 "코드 | 제목"으로 병기한다.
// 예: 한국어 제목 "영점 절차"에 slug "rezero-procedure" → "rezero-procedure | 영점 절차"
// 코드를 앞에 두는 이유: 여러 항목을 세로로 훑을 때 왼쪽 끝이 코드로 정렬돼 눈이 덜 흔들린다.
// (목록·사이드바처럼 세로로 나열되는 자리는 이 인라인 병기 대신 열/줄로 분리해 그린다.)
function displayName(title, slug) {
  if (!title || title === slug) return slug;
  return slug + ' | ' + title;
}
// 개념을 참조하는 기능들(그래프 엣지에서 역추적)
function relatedFeatures(slug) {
  var edges = (state.manifest.graph && state.manifest.graph.edges) || [];
  return edges
    .filter(function (e) {
      return e.kind === 'feature-concept' && e.target === 'c:' + slug;
    })
    .map(function (e) {
      return featureEntry(e.source.slice(2));
    })
    .filter(Boolean);
}

// ---- 간이 마크다운 렌더러 ----
// 의존성 0 원칙에 따라 직접 구현. DOM을 h()로만 생성(innerHTML 미사용)해 XSS를 차단한다.
// 지원: 제목(#~######) · 목록(-,*,1. + 2칸 들여쓰기 중첩) · 코드펜스 · 인용(>) · 표(|) ·
// 구분선(---) · 인라인 `코드`/**굵게**/[링크](url). 그 외는 문단으로 취급.
function mdInline(text) {
  var out = [];
  var re = /(`[^`]*`)|(\*\*[^*]+\*\*)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  var last = 0,
    m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(h('code', null, m[1].slice(1, -1)));
    else if (m[2]) out.push(h('strong', null, m[2].slice(2, -2)));
    else if (m[3]) {
      var href = m[5];
      if (/^(https?:\/\/|#|\.{0,2}\/)/.test(href)) out.push(h('a', { href: href }, m[4]));
      else out.push(m[4]); // javascript: 등 비허용 스킴은 텍스트로만
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderMarkdown(md) {
  md = md.replace(/<!--[\s\S]*?-->/g, ''); // 템플릿 안내용 HTML 주석 제거
  var root = h('div', { class: 'md' });
  var lines = md.split(/\r?\n/);
  var i = 0;
  function isTableRow(s) {
    return /^\s*\|.*\|\s*$/.test(s);
  }
  function cells(row) {
    return row
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(function (s) {
        return s.trim();
      });
  }
  while (i < lines.length) {
    var L = lines[i];
    if (/^\s*$/.test(L)) {
      i++;
      continue;
    }
    if (/^```/.test(L)) {
      var code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++;
      root.appendChild(h('pre', null, h('code', null, code.join('\n'))));
      continue;
    }
    var mH = L.match(/^(#{1,6})\s+(.*)$/);
    if (mH) {
      root.appendChild(h('h' + mH[1].length, null, mdInline(mH[2])));
      i++;
      continue;
    }
    if (/^\s*-{3,}\s*$/.test(L)) {
      root.appendChild(h('hr'));
      i++;
      continue;
    }
    if (/^>\s?/.test(L)) {
      var qs = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        qs.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      root.appendChild(h('blockquote', null, h('p', null, mdInline(qs.join(' ')))));
      continue;
    }
    if (isTableRow(L)) {
      var rows = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(lines[i]);
        i++;
      }
      var hasHeader = rows.length > 1 && /^[\s|:\-]+$/.test(rows[1]);
      var table = h('table');
      var bodyRows = rows;
      if (hasHeader) {
        table.appendChild(
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              cells(rows[0]).map(function (c) {
                return h('th', null, mdInline(c));
              })
            )
          )
        );
        bodyRows = rows.slice(2);
      }
      table.appendChild(
        h(
          'tbody',
          null,
          bodyRows.map(function (r) {
            return h(
              'tr',
              null,
              cells(r).map(function (c) {
                return h('td', null, mdInline(c));
              })
            );
          })
        )
      );
      root.appendChild(table);
      continue;
    }
    var mList = L.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (mList) {
      var items = [];
      while (i < lines.length) {
        var ml = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (!ml) break;
        items.push({ indent: ml[1].length, ordered: /^\d/.test(ml[2]), text: ml[3] });
        i++;
      }
      var list = h(items[0].ordered ? 'ol' : 'ul');
      var lastLi = null,
        sub = null;
      items.forEach(function (it) {
        if (it.indent >= 2 && lastLi) {
          if (!sub) {
            sub = h(it.ordered ? 'ol' : 'ul');
            lastLi.appendChild(sub);
          }
          sub.appendChild(h('li', null, mdInline(it.text)));
        } else {
          sub = null;
          lastLi = h('li', null, mdInline(it.text));
          list.appendChild(lastLi);
        }
      });
      root.appendChild(list);
      continue;
    }
    var para = [L];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|```|>|\s*([-*]|\d+\.)\s|\s*\|.*\|\s*$)/.test(lines[i]) &&
      !/^\s*-{3,}\s*$/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    root.appendChild(h('p', null, mdInline(para.join(' '))));
  }
  return root;
}

// ---- 뷰: 아키텍처/인프라 문서 ----
function viewDoc(kind) {
  var t = state.t;
  var label = kind === 'architecture' ? t.architecture : t.infra;
  fetch('../../' + kind + '/' + kind + '.md', { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(function (md) {
      // 첫 제목과 주석을 걷어냈을 때 내용이 없으면 "작성 전" 안내를 함께 보여준다.
      var stripped = md
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/^#.*$/m, '')
        .trim();
      setApp(
        h('div', { class: 'wrap' }, [
          breadcrumbs([{ label: t.home, href: '#/' }, { label: label }]),
          renderMarkdown(md),
          stripped ? null : h('p', { class: 'muted' }, t.docEmpty),
          pagenav(),
        ])
      );
    })
    .catch(renderError);
}

// ---- 검색 ----
// 개념(제목·slug·그룹·분류) · 기능(제목·slug) · 파일 경로(@concept 색인 = 그래프의 파일 노드)를
// 부분 일치로 찾는다. 파일 결과에는 그 파일에 연결된 개념·기능 링크를 함께 보여준다.
function searchData(q) {
  q = q.toLowerCase();
  var m = state.manifest;
  var concepts = (m.concepts || []).filter(function (c) {
    return (
      (c.title + ' ' + c.slug + ' ' + (c.group || '') + ' ' + (c.category || []).join(' '))
        .toLowerCase()
        .indexOf(q) !== -1
    );
  });
  var features = (m.features || []).filter(function (f) {
    return (f.title + ' ' + f.slug).toLowerCase().indexOf(q) !== -1;
  });
  var nodes = (m.graph && m.graph.nodes) || [];
  var edges = (m.graph && m.graph.edges) || [];
  var files = nodes
    .filter(function (n) {
      return (
        n.type === 'file' &&
        String(n.title || n.label || '')
          .toLowerCase()
          .indexOf(q) !== -1
      );
    })
    .map(function (n) {
      var linked = edges.filter(function (e) {
        return e.target === n.id;
      });
      return {
        path: n.title || n.label,
        concepts: linked
          .filter(function (e) {
            return e.kind === 'concept-file';
          })
          .map(function (e) {
            return e.source.slice(2);
          }),
        features: linked
          .filter(function (e) {
            return e.kind === 'feature-file';
          })
          .map(function (e) {
            return e.source.slice(2);
          }),
      };
    });
  return { concepts: concepts, features: features, files: files };
}

function renderSearchResults(q, box) {
  var t = state.t;
  box.textContent = '';
  var r = searchData(q);
  if (!r.concepts.length && !r.features.length && !r.files.length) {
    box.appendChild(h('p', { class: 'muted' }, t.noResults));
    return;
  }
  if (r.concepts.length) {
    box.appendChild(
      h('section', { class: 'group' }, [
        h('h2', null, t.conceptList),
        conceptTable(r.concepts, true),
      ])
    );
  }
  if (r.features.length) {
    box.appendChild(
      h('section', { class: 'group' }, [h('h2', null, t.featureList), featureTable(r.features)])
    );
  }
  if (r.files.length) {
    box.appendChild(
      h('section', { class: 'group' }, [
        h('h2', null, t.fileResults),
        h(
          'ul',
          null,
          r.files.map(function (f) {
            var links = [];
            f.concepts.forEach(function (cs) {
              if (links.length) links.push(' · ');
              links.push(h('a', { href: '#/concept/' + cs }, displayName(conceptTitle(cs), cs)));
            });
            f.features.forEach(function (fs) {
              var e = featureEntry(fs);
              if (links.length) links.push(' · ');
              links.push(h('a', { href: '#/feature/' + fs }, e ? displayName(e.title, fs) : fs));
            });
            return h('li', null, [
              h('code', null, f.path),
              links.length ? h('small', null, [' → '].concat(links)) : null,
            ]);
          })
        ),
      ])
    );
  }
}

// ---- 뷰: 목록 ----
// 목록 페이지는 표(코드 열 · 제목 열 분리), 사이드바는 좁으니 코드·제목 2줄 스택으로 그린다.
// 두 자리 모두 "코드"와 "제목"이 각각 독립한 요소라, 인라인 병기(displayName)는 쓰지 않는다.

// 표 한 줄: 코드 칸과 제목 칸 모두 같은 대상으로 가는 링크(어느 쪽을 눌러도 이동).
function tableRowCells(href, slug, title) {
  return [
    h('td', { class: 'ctable__code' }, h('a', { href: href }, slug)),
    h('td', { class: 'ctable__title' }, h('a', { href: href }, title || slug)),
  ];
}
// showGroup: 검색 결과처럼 여러 묶음이 섞여 나오는 자리에서만 묶음 열을 덧붙인다
// (목록 페이지는 이미 묶음별 섹션으로 나뉘어 있어 중복이다).
function conceptTable(items, showGroup) {
  var t = state.t;
  return h(
    'div',
    { class: 'ctable-wrap' },
    h('table', { class: 'ctable' }, [
      h(
        'thead',
        null,
        h('tr', null, [
          h('th', { class: 'ctable__status', scope: 'col' }, t.colStatus),
          h('th', { class: 'ctable__code', scope: 'col' }, t.colCode),
          h('th', { class: 'ctable__title', scope: 'col' }, t.colTitle),
          showGroup ? h('th', { class: 'ctable__meta', scope: 'col' }, t.colGroup) : null,
          h('th', { class: 'ctable__meta', scope: 'col' }, t.category),
        ])
      ),
      h(
        'tbody',
        null,
        items.map(function (c) {
          return h(
            'tr',
            null,
            [h('td', { class: 'ctable__status' }, statusDot(c.status))]
              .concat(tableRowCells('#/concept/' + c.slug, c.slug, c.title))
              .concat([
                showGroup ? h('td', { class: 'ctable__meta' }, c.group || '') : null,
                h('td', { class: 'ctable__meta' }, (c.category || []).join(', ')),
              ])
          );
        })
      ),
    ])
  );
}
function featureTable(items) {
  var t = state.t;
  return h(
    'div',
    { class: 'ctable-wrap' },
    h('table', { class: 'ctable ctable--feature' }, [
      h(
        'thead',
        null,
        h('tr', null, [
          h('th', { class: 'ctable__code', scope: 'col' }, t.colCode),
          h('th', { class: 'ctable__title', scope: 'col' }, t.colTitle),
          h('th', { class: 'ctable__meta', scope: 'col' }, t.codeLinksLabel),
        ])
      ),
      h(
        'tbody',
        null,
        items.map(function (f) {
          return h(
            'tr',
            null,
            tableRowCells('#/feature/' + f.slug, f.slug, f.title).concat([
              h(
                'td',
                { class: 'ctable__meta' },
                String(f.codePathCount == null ? '' : f.codePathCount)
              ),
            ])
          );
        })
      ),
    ])
  );
}
// 사이드바 항목: 코드 줄 위, 제목 줄 아래. 제목이 코드와 같으면 제목 줄은 만들지 않는다.
// li의 textContent에 코드와 제목이 모두 남아야 sidebar-search의 걸러내기가 둘 다로 동작한다.
function sideItem(href, slug, title, isActive) {
  return h(
    'a',
    {
      class: 'side-item',
      href: href,
      'aria-current': isActive ? 'page' : null,
      title: displayName(title, slug),
    },
    [
      h('span', { class: 'side-item__code' }, slug),
      title && title !== slug ? h('span', { class: 'side-item__title' }, title) : null,
    ]
  );
}
// active: null 또는 { kind: 'concept'|'feature', slug } — 사이드바에서 현재 보고 있는 항목 강조용.
// compact: true면 사이드바용(2줄 스택 + 축약 상태 표시), 기본(목록 페이지)은 표.
function conceptListSections(active, compact) {
  var m = state.manifest;
  var groups = {};
  (m.concepts || []).forEach(function (c) {
    var g = c.group || '(ungrouped)';
    (groups[g] = groups[g] || []).push(c);
  });
  return Object.keys(groups).map(function (g) {
    return h('section', { class: 'group', id: 'g-' + g }, [
      h('h2', null, g),
      compact
        ? h(
            'ul',
            null,
            groups[g].map(function (c) {
              var isActive = !!(active && active.kind === 'concept' && active.slug === c.slug);
              return h('li', { class: isActive ? 'active' : null }, [
                statusDot(c.status),
                sideItem('#/concept/' + c.slug, c.slug, c.title, isActive),
                h('small', null, (c.category || []).join(', ')),
              ]);
            })
          )
        : conceptTable(groups[g]),
    ]);
  });
}
function featureListSection(active, compact) {
  var t = state.t;
  var m = state.manifest;
  if (!(m.features || []).length) return null;
  return h('section', { class: 'group', id: 'g-__features' }, [
    h('h2', null, t.featureList),
    compact
      ? h(
          'ul',
          null,
          m.features.map(function (f) {
            var isActive = !!(active && active.kind === 'feature' && active.slug === f.slug);
            return h('li', { class: isActive ? 'active' : null }, [
              sideItem('#/feature/' + f.slug, f.slug, f.title, isActive),
              h('small', null, String(f.codePathCount)),
            ]);
          })
        )
      : featureTable(m.features),
  ]);
}
// scrollTo: 그룹 이름(또는 '__features') — #/group/:g 라우트로 진입하면 해당 섹션으로 스크롤.
function viewIndex(scrollTo) {
  var t = state.t;
  var m = state.manifest;
  var sections = conceptListSections(null, false);
  var featureSection = featureListSection(null, false);
  var body = (m.concepts || []).length ? sections : [h('p', { class: 'muted' }, t.empty)];
  // 검색: 입력이 있으면 목록 대신 결과를 보여주고, 지우면 목록으로 복귀한다.
  var bodyBox = h('div', null, [body, featureSection]);
  var resultBox = h('div', { class: 'search-results' });
  resultBox.style.display = 'none';
  var searchIn = h('input', { type: 'search', class: 'search-in', placeholder: t.searchPh });
  searchIn.addEventListener('input', function () {
    var q = searchIn.value.trim();
    if (!q) {
      resultBox.textContent = '';
      resultBox.style.display = 'none';
      bodyBox.style.display = '';
      return;
    }
    bodyBox.style.display = 'none';
    resultBox.style.display = '';
    renderSearchResults(q, resultBox);
  });
  setApp(
    h('div', { class: 'wrap' }, [
      breadcrumbs([{ label: t.home }]),
      h('header', { class: 'hero' }, [
        h('div', { class: 'hero__top' }, [h('h1', null, t.appTitle), statusLegend()]),
        h('nav', { class: 'pagenav' }, [
          h('a', { class: 'graph-link', href: '#/graph' }, t.openGraph + ' →'),
          ' · ',
          h('a', { href: '#/architecture' }, t.architecture),
          ' · ',
          h('a', { href: '#/infra' }, t.infra),
        ]),
        searchIn,
      ]),
      resultBox,
      bodyBox,
    ])
  );
  if (scrollTo) {
    var el = document.getElementById('g-' + scrollTo);
    if (el) el.scrollIntoView();
  }
}

// ---- 뷰: 개념 상세 ----
// fetch는 한 번, 렌더는 읽기/편집 모드로 분리. 모드 토글 시 재fetch 없이 다시 그린다.
function viewConcept(slug) {
  var entry = conceptEntry(slug);
  if (!entry) return renderMissing();
  state.editing = false;
  fetchJson(entry.url)
    .then(function (c) {
      state.current = c;
      renderConcept(slug);
    })
    .catch(renderError);
}
// 저장/상태변경 후 manifest+data를 다시 읽어 목록 배지까지 최신화한 뒤 재렌더.
function reloadConcept(slug) {
  return fetchJson('manifest.json').then(function (m) {
    state.manifest = m;
    var entry = conceptEntry(slug);
    if (!entry) return renderMissing();
    return fetchJson(entry.url).then(function (c) {
      state.current = c;
      renderConcept(slug);
    });
  });
}
function renderConcept(slug) {
  if (state.editing) return renderConceptEdit(slug);
  return renderConceptRead(slug);
}

// 상태 전이 컨트롤: 허용 전이만 활성. green은 비활성(정착) + 사유 툴팁.
function statusControl(slug, c) {
  var t = state.t;
  var allowed = ALLOWED_TRANSITIONS[c.status] || [];
  var defs = [
    ['green', t.statusGreen],
    ['pending', t.statusYellow],
    ['red', t.statusRed],
  ];
  var btns = defs.map(function (d) {
    var target = d[0];
    var isCurrent = target === c.status;
    var canDo = allowed.indexOf(target) !== -1;
    var attrs = {
      type: 'button',
      class: 'st-btn st-btn--' + target + (isCurrent ? ' st-btn--current' : ''),
    };
    if (!canDo || isCurrent) attrs.disabled = 'disabled';
    if (c.status === 'green' && !isCurrent) attrs.title = t.greenSettled;
    var btn = h('button', attrs, d[1]);
    if (canDo && !isCurrent) {
      btn.addEventListener('click', function () {
        sendJson('POST', '/api/concept/' + encodeURIComponent(slug) + '/status', { status: target })
          .then(function () {
            toast(t.saved, 'ok');
            return reloadConcept(slug);
          })
          .catch(function (e) {
            toast(t.saveFailed + ': ' + e.message, 'err');
          });
      });
    }
    return btn;
  });
  return h(
    'div',
    { class: 'st-ctrl' },
    [h('span', { class: 'st-ctrl__label' }, t.setStatus + ':')].concat(btns)
  );
}

// 읽기 모드.
function renderConceptRead(slug) {
  var t = state.t;
  var c = state.current;
  var entry = conceptEntry(slug);
  var related = relatedFeatures(slug);
  var codeLinks = (entry && entry.codeLinks) || [];
  var editBar = state.editable
    ? h('div', { class: 'edit-bar' }, [
        statusControl(slug, c),
        h('button', { type: 'button', class: 'edit-btn' }, t.edit),
      ])
    : null;
  if (editBar) {
    editBar.querySelector('.edit-btn').addEventListener('click', function () {
      state.editing = true;
      renderConcept(slug);
    });
  }
  var group = (entry && entry.group) || '(ungrouped)';
  var sections = [
    breadcrumbs([
      { label: t.home, href: '#/' },
      { label: group, href: '#/group/' + encodeURIComponent(group) },
      { label: displayName(c.title, slug) },
    ]),
    h('header', { class: 'hero' }, [
      c.eyebrow ? h('span', { class: 'hero__eyebrow' }, c.eyebrow) : null,
      statusBadge(c.status),
      h('h1', null, displayName(c.title, slug)),
      h('p', null, c.description.definition),
      h('p', { class: 'cats' }, (c.category || []).join(' · ')),
    ]),
    editBar,
    // 정의는 hero(제목 아래)에서 이미 보여주므로 여기서 반복하지 않는다.
    c.description.analogy || (c.description.components || []).length || c.description.example
      ? h('section', { class: 'section' }, [
          h('h2', null, t.description),
          c.description.analogy ? h('p', { class: 'analogy' }, c.description.analogy) : null,
          ul(c.description.components),
          c.description.example ? h('p', null, c.description.example) : null,
        ])
      : null,
    h('section', { class: 'section' }, [
      h('h2', null, t.purpose),
      h('p', null, c.purpose.reason),
      ul(c.purpose.benefits),
    ]),
    h('section', { class: 'section cols' }, [
      h('div', { class: 'col-card col-card--allow' }, [
        h('h3', null, t.allow),
        ul(c.actions.allow),
      ]),
      h('div', { class: 'col-card col-card--restrict' }, [
        h('h3', null, t.restrict),
        ul(c.actions.restrict),
      ]),
    ]),
    h('section', { class: 'section' }, [
      h('h2', null, t.principle),
      ul(c.principle.immutableRules),
      c.principle.tradeoffs ? h('p', null, c.principle.tradeoffs) : null,
    ]),
    related.length
      ? h('section', { class: 'section' }, [
          h('h2', null, t.relatedFeatures),
          h(
            'ul',
            { class: 'links' },
            related.map(function (f) {
              return h(
                'li',
                null,
                h('a', { href: '#/feature/' + f.slug }, displayName(f.title, f.slug))
              );
            })
          ),
        ])
      : null,
    codeLinks.length
      ? h('section', { class: 'section' }, [
          h('h2', null, t.implementationPaths),
          h(
            'ul',
            { class: 'paths' },
            codeLinks.map(function (p) {
              return h('li', null, h('code', null, p));
            })
          ),
        ])
      : null,
    h('nav', { class: 'pagenav' }, [
      h('a', { href: '#/' }, t.conceptList),
      ' · ',
      h('a', { class: 'graph-link', href: '#/graph/' + slug }, t.openGraph + ' →'),
    ]),
  ];
  setApp(CPSidebar.shell('concept', slug, h('div', { class: 'wrap' }, sections)));
}

// ---- 편집 폼 헬퍼 ----
var CATEGORIES = ['feature', 'behavior', 'role', 'permission', 'term'];
function toLines(str) {
  return String(str || '')
    .split('\n')
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
}
function linesOf(arr) {
  return (arr || []).join('\n');
}
// label + 컨트롤 행. ctrl은 input/textarea 노드. 반환: { row, ctrl }
function field(labelText, ctrl, hint) {
  return h('label', { class: 'fld' }, [
    h('span', { class: 'fld__label' }, labelText + (hint ? ' (' + hint + ')' : '')),
    ctrl,
  ]);
}
function input(value) {
  var n = h('input', { type: 'text', class: 'fld__in' });
  n.value = value || '';
  return n;
}
function area(value, rows) {
  var n = h('textarea', { class: 'fld__ta', rows: String(rows || 3) });
  n.value = value || '';
  return n;
}

// 편집 모드: 화이트리스트 필드만 폼으로. 저장 시 섹션 전체를 patch로 보낸다.
function renderConceptEdit(slug) {
  var t = state.t;
  var c = state.current;
  var f = {};
  f.title = input(c.title);
  f.eyebrow = input(c.eyebrow);
  var catBox = h(
    'div',
    { class: 'cats-pick' },
    CATEGORIES.map(function (cat) {
      var cb = h('input', { type: 'checkbox', value: cat });
      if ((c.category || []).indexOf(cat) !== -1) cb.checked = true;
      f['cat_' + cat] = cb;
      return h('label', { class: 'cat-pick' }, [cb, ' ' + cat]);
    })
  );
  f.definition = area(c.description.definition, 3);
  f.analogy = area(c.description.analogy, 2);
  f.components = area(linesOf(c.description.components), 3);
  f.example = area(c.description.example, 2);
  f.reason = area(c.purpose.reason, 3);
  f.benefits = area(linesOf(c.purpose.benefits), 3);
  f.vision = area(c.purpose.vision, 2);
  f.painPoints = area(linesOf(c.purpose.painPoints), 3);
  f.allow = area(linesOf(c.actions.allow), 3);
  f.restrict = area(linesOf(c.actions.restrict), 3);
  f.interaction = area(c.actions.interaction, 2);
  f.immutableRules = area(linesOf(c.principle.immutableRules), 3);
  f.tradeoffs = area(c.principle.tradeoffs, 2);
  f.lifecycle = area(linesOf(c.principle.lifecycle), 3);
  f.prev = input(c.relations.prev);
  f.next = input(c.relations.next);
  f.related = area(linesOf(c.relations.related), 2);
  f.codeLinks = area(linesOf(c.codeLinks), 3);

  function collect() {
    var category = CATEGORIES.filter(function (cat) {
      return f['cat_' + cat].checked;
    });
    return {
      title: f.title.value.trim(),
      eyebrow: f.eyebrow.value.trim(),
      category: category,
      description: {
        definition: f.definition.value.trim(),
        analogy: f.analogy.value.trim(),
        components: toLines(f.components.value),
        example: f.example.value.trim(),
      },
      purpose: {
        reason: f.reason.value.trim(),
        benefits: toLines(f.benefits.value),
        vision: f.vision.value.trim(),
        painPoints: toLines(f.painPoints.value),
      },
      actions: {
        allow: toLines(f.allow.value),
        restrict: toLines(f.restrict.value),
        interaction: f.interaction.value.trim(),
      },
      principle: {
        immutableRules: toLines(f.immutableRules.value),
        tradeoffs: f.tradeoffs.value.trim(),
        lifecycle: toLines(f.lifecycle.value),
      },
      relations: {
        prev: f.prev.value.trim(),
        next: f.next.value.trim(),
        related: toLines(f.related.value),
      },
      codeLinks: toLines(f.codeLinks.value),
    };
  }

  var saveBtn = h('button', { type: 'button', class: 'edit-btn edit-btn--save' }, t.save);
  var cancelBtn = h('button', { type: 'button', class: 'edit-btn' }, t.cancel);
  saveBtn.addEventListener('click', function () {
    var patch = collect();
    if (!patch.category.length) {
      toast(t.saveFailed + ': category', 'err');
      return;
    }
    if (!patch.description.definition) {
      toast(t.saveFailed + ': ' + t.definition, 'err');
      return;
    }
    if (!patch.purpose.reason) {
      toast(t.saveFailed + ': ' + t.reason, 'err');
      return;
    }
    var wasGreen = c.status === 'green';
    saveBtn.disabled = 'disabled';
    sendJson('PUT', '/api/concept/' + encodeURIComponent(slug), { patch: patch })
      .then(function () {
        // green→pending 강등 시엔 안내를 합쳐 한 토스트로(겹침 방지), 아니면 저장 완료만.
        if (wasGreen) toast(t.saved + ' — ' + t.downgradedNotice, 'warn');
        else toast(t.saved, 'ok');
        state.editing = false;
        return reloadConcept(slug);
      })
      .catch(function (e) {
        saveBtn.disabled = null;
        toast(t.saveFailed + ': ' + e.message, 'err');
      });
  });
  cancelBtn.addEventListener('click', function () {
    state.editing = false;
    renderConcept(slug);
  });

  var editEntry = conceptEntry(slug);
  var editGroup = (editEntry && editEntry.group) || '(ungrouped)';
  setApp(
    CPSidebar.shell(
      'concept',
      slug,
      h('div', { class: 'wrap' }, [
        breadcrumbs([
          { label: t.home, href: '#/' },
          { label: editGroup, href: '#/group/' + encodeURIComponent(editGroup) },
          { label: displayName(c.title, slug) },
        ]),
        h('header', { class: 'hero' }, [
          statusBadge(c.status),
          h('h1', null, displayName(c.title, slug)),
        ]),
        h('div', { class: 'edit-bar' }, [saveBtn, cancelBtn]),
        h('section', { class: 'section edit-form' }, [
          field(t.title, f.title),
          field(t.eyebrow, f.eyebrow),
          field(t.category, catBox),
          h('h2', null, t.description),
          field(t.definition, f.definition),
          field(t.analogy, f.analogy),
          field(t.components, f.components, t.linesHint),
          field(t.example, f.example),
          h('h2', null, t.purpose),
          field(t.reason, f.reason),
          field(t.benefits, f.benefits, t.linesHint),
          field(t.vision, f.vision),
          field(t.painPoints, f.painPoints, t.linesHint),
          h('h2', null, t.allow + ' / ' + t.restrict),
          field(t.allow, f.allow, t.linesHint),
          field(t.restrict, f.restrict, t.linesHint),
          field(t.interaction, f.interaction),
          h('h2', null, t.principle),
          field(t.immutableRules, f.immutableRules, t.linesHint),
          field(t.tradeoffs, f.tradeoffs),
          field(t.lifecycle, f.lifecycle, t.linesHint),
          h('h2', null, t.relatedConcepts),
          field('prev', f.prev),
          field('next', f.next),
          field(t.relatedSlugs, f.related, t.linesHint),
          field(t.codeLinksLabel, f.codeLinks, t.linesHint),
        ]),
        h('nav', { class: 'pagenav' }, [h('a', { href: '#/' }, t.conceptList)]),
      ])
    )
  );
}

// ---- 뷰: 기능 상세 ----
function viewFeature(slug) {
  var entry = featureEntry(slug);
  if (!entry) return renderMissing();
  var t = state.t;
  fetchJson(entry.url)
    .then(function (f) {
      var conceptLinks = (f.concepts || []).map(function (cs) {
        var e = conceptEntry(cs);
        return e
          ? h('li', null, h('a', { href: '#/concept/' + cs }, displayName(e.title, cs)))
          : h('li', null, h('span', { class: 'muted' }, cs));
      });
      var paths = (f.codePaths || []).length
        ? h(
            'ul',
            { class: 'paths' },
            f.codePaths.map(function (p) {
              return h('li', null, h('code', null, p));
            })
          )
        : null;
      setApp(
        CPSidebar.shell(
          'feature',
          slug,
          h('div', { class: 'wrap' }, [
            breadcrumbs([
              { label: t.home, href: '#/' },
              { label: t.featureList, href: '#/group/__features' },
              { label: displayName(f.title, slug) },
            ]),
            h('header', { class: 'hero' }, [
              h('span', { class: 'hero__eyebrow' }, t.featureEyebrow),
              h('h1', null, displayName(f.title, slug)),
              f.description ? h('p', null, f.description) : null,
            ]),
            h('section', { class: 'section' }, [
              h('h2', null, t.relatedConcepts),
              h('ul', { class: 'links' }, conceptLinks),
            ]),
            h('section', { class: 'section' }, [h('h2', null, t.implementationPaths), paths]),
            pagenav(),
          ])
        )
      );
    })
    .catch(renderError);
}

// 선택한 개념의 1-hop 이웃만 추린다: 개념 자신 + 그 개념을 실현하는 기능 +
// 개념·기능이 가리키는 파일 + (맥락용) 그 기능들이 함께 실현하는 다른 개념(잎 노드).
function subgraphFor(data, slug) {
  var focusId = 'c:' + slug;
  var keep = {};
  keep[focusId] = true;
  var feats = {};
  data.edges.forEach(function (e) {
    if (e.kind === 'feature-concept' && e.target === focusId) {
      keep[e.source] = true;
      feats[e.source] = true;
    }
    if (e.kind === 'concept-file' && e.source === focusId) keep[e.target] = true;
  });
  data.edges.forEach(function (e) {
    if (!feats[e.source]) return;
    if (e.kind === 'feature-file') keep[e.target] = true; // 기능→코드
    if (e.kind === 'feature-concept') keep[e.target] = true; // 형제 개념(맥락 잎)
  });
  return {
    nodes: data.nodes.filter(function (n) {
      return keep[n.id];
    }),
    edges: data.edges.filter(function (e) {
      return keep[e.source] && keep[e.target];
    }),
  };
}

// 개념 선택 드롭다운: 변경 시 #/graph/<slug> 로 이동(전체 보기는 __all).
function focusSelect(concepts, value) {
  var t = state.t;
  var sel = h('select', { class: 'graph-focus', 'aria-label': t.conceptNode });
  sel.appendChild(h('option', { value: '__all' }, t.allConcepts));
  concepts.forEach(function (c) {
    sel.appendChild(h('option', { value: c.slug }, displayName(c.title, c.slug)));
  });
  sel.value = value;
  sel.addEventListener('change', function () {
    window.location.hash = '/graph/' + sel.value;
  });
  return sel;
}

// ---- 뷰: 지식 그래프 ----
// focusSlug: 개념 slug면 그 이웃만, '__all'이면 전체, 없으면 첫 개념을 기본 포커스.
function viewGraph(focusSlug) {
  var t = state.t;
  var full = state.manifest.graph || { nodes: [], edges: [] };
  var concepts = state.manifest.concepts || [];
  var isAll = focusSlug === '__all';
  var effective = isAll ? null : focusSlug || (concepts.length ? concepts[0].slug : null);
  var data = effective ? subgraphFor(full, effective) : full;
  // 노드 색상 범례 — 그래프 우측 상단에 오버레이로 항상 표시
  var legend = h('div', { class: 'graph-legend' }, [
    h('span', { class: 'lg' }, [h('i', { class: 'dot dot--concept' }), t.conceptNode]),
    h('span', { class: 'lg' }, [h('i', { class: 'dot dot--feature' }), t.featureNode]),
    h('span', { class: 'lg' }, [h('i', { class: 'dot dot--file' }), t.fileNode]),
  ]);
  var svg = h('svg', { id: 'graph', class: 'graph' });
  var zoomBox = h('span', { class: 'graph-zoom' });
  var crumbs = effective
    ? breadcrumbs([
        { label: t.home, href: '#/' },
        { label: t.graphTitle, href: '#/graph/__all' },
        { label: displayName(conceptTitle(effective), effective) },
      ])
    : breadcrumbs([{ label: t.home, href: '#/' }, { label: t.graphTitle }]);
  setApp(
    h('div', { class: 'graph-shell' }, [
      h('header', { class: 'graph-bar' }, [
        crumbs,
        concepts.length ? focusSelect(concepts, effective || '__all') : null,
        zoomBox,
      ]),
      svg,
      legend,
    ]),
    { graph: true }
  );
  renderGraph(svg, data, ++renderGen, zoomBox);
}

// 의존성 없는 force-directed 시뮬레이션. 라벨은 textContent로만 설정한다.
// 카메라(viewBox) 배율: 프리셋 선택(폭맞춤·쪽맞춤·75~200%) — 휠 줌은 민감해서 제공하지 않는다.
// 휠은 상하좌우 스크롤(팬), 빈 배경 드래그도 팬. 기본은 폭맞춤이며, 사용자가 팬하기 전까지
// 시뮬레이션이 움직이는 동안 계속 다시 맞춘다(추적).
function renderGraph(svg, data, gen, zoomBox) {
  var NS = 'http://www.w3.org/2000/svg';
  function size() {
    return {
      w: svg.clientWidth || window.innerWidth,
      h: svg.clientHeight || window.innerHeight - 56,
    };
  }
  var dim = size(),
    W = dim.w,
    H = dim.h;
  var view = { x: 0, y: 0, w: W, h: H };
  var trackMode = 'fitw'; // 'fitw'(폭맞춤) | 'fitp'(쪽맞춤) — 퍼센트 배율은 추적 없음
  var tracking = true; // 팬/스크롤하는 순간 false — 같은 옵션을 다시 선택하면 재추적
  function applyView() {
    svg.setAttribute('viewBox', view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h);
  }
  applyView();
  var n = data.nodes.length || 1;
  var nodes = data.nodes.map(function (d, i) {
    var a = (i / n) * Math.PI * 2,
      R = Math.min(W, H) * 0.32;
    return {
      id: d.id,
      label: d.label,
      type: d.type,
      href: d.href,
      title: d.title,
      x: W / 2 + Math.cos(a) * R,
      y: H / 2 + Math.sin(a) * R,
      vx: 0,
      vy: 0,
      fixed: false,
      drag: false,
    };
  });
  var byId = {};
  nodes.forEach(function (d) {
    byId[d.id] = d;
  });
  var edges = data.edges
    .map(function (e) {
      return { s: byId[e.source], t: byId[e.target] };
    })
    .filter(function (e) {
      return e.s && e.t;
    });
  var gE = h('g');
  svg.appendChild(gE);
  var gN = h('g');
  svg.appendChild(gN);
  var lines = edges.map(function () {
    var l = document.createElementNS(NS, 'line');
    l.setAttribute('class', 'gedge');
    gE.appendChild(l);
    return l;
  });
  function toLocal(ev) {
    var r = svg.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * view.w + view.x,
      y: ((ev.clientY - r.top) / r.height) * view.h + view.y,
    };
  }

  // 노드 경계 상자(라벨 폭 여유 포함)
  function bbox() {
    var b = { minX: 1e9, minY: 1e9, maxX: -1e9, maxY: -1e9 };
    nodes.forEach(function (d) {
      if (d.x < b.minX) b.minX = d.x;
      if (d.x > b.maxX) b.maxX = d.x;
      if (d.y < b.minY) b.minY = d.y;
      if (d.y > b.maxY) b.maxY = d.y;
    });
    return b;
  }
  var PAD = 60,
    LABEL_ROOM = 150;
  // 쪽맞춤: 그래프 전체가 화면 안에 들어오게
  function fitPage() {
    if (!nodes.length) return;
    var b = bbox();
    var bw = b.maxX - b.minX + PAD * 2 + LABEL_ROOM,
      bh = b.maxY - b.minY + PAD * 2;
    var ar = W / H;
    if (bw / bh > ar) bh = bw / ar;
    else bw = bh * ar;
    view.x = (b.minX + b.maxX + LABEL_ROOM) / 2 - bw / 2;
    view.y = (b.minY + b.maxY) / 2 - bh / 2;
    view.w = bw;
    view.h = bh;
    applyView();
  }
  // 폭맞춤(기본): 그래프 폭을 화면 폭에 맞추고 위 정렬 — 세로로 길면 휠 스크롤로 내려본다
  function fitWidth() {
    if (!nodes.length) return;
    var b = bbox();
    var bw = b.maxX - b.minX + PAD * 2 + LABEL_ROOM;
    view.x = b.minX - PAD;
    view.y = b.minY - PAD;
    view.w = bw;
    view.h = bw * (H / W);
    applyView();
  }
  // 퍼센트 배율: 100% = 1css픽셀 : 1좌표. 현재 중심 유지.
  function setPercent(p) {
    var cx = view.x + view.w / 2,
      cy = view.y + view.h / 2;
    view.w = W / (p / 100);
    view.h = H / (p / 100);
    view.x = cx - view.w / 2;
    view.y = cy - view.h / 2;
    applyView();
  }

  // 휠 = 스크롤(팬). 줌은 휠에 두지 않는다(민감도 문제) — 배율은 프리셋 선택으로만.
  svg.addEventListener(
    'wheel',
    function (ev) {
      ev.preventDefault();
      tracking = false;
      var r = svg.getBoundingClientRect();
      view.x += (ev.deltaX / r.width) * view.w;
      view.y += (ev.deltaY / r.height) * view.h;
      applyView();
    },
    { passive: false }
  );
  svg.addEventListener('mousedown', function (ev) {
    var t = ev.target;
    while (t && t !== svg) {
      // 노드 위 드래그는 노드 이동이 우선
      if (t.getAttribute && /\bgnode\b/.test(t.getAttribute('class') || '')) return;
      t = t.parentNode;
    }
    ev.preventDefault();
    tracking = false;
    var start = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y };
    var r = svg.getBoundingClientRect();
    function mv(e2) {
      view.x = start.vx - ((e2.clientX - start.x) / r.width) * view.w;
      view.y = start.vy - ((e2.clientY - start.y) / r.height) * view.h;
      applyView();
    }
    function up() {
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', up);
    }
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  });

  // 배율 프리셋 선택: 폭맞춤(기본) · 쪽맞춤 · 75~200%
  if (zoomBox) {
    var zsel = h('select', {
      class: 'graph-focus graph-zoom-sel',
      'aria-label': state.t.zoomLabel,
    });
    [
      ['fitw', state.t.fitWidth],
      ['fitp', state.t.fitPage],
      ['75', '75%'],
      ['100', '100%'],
      ['125', '125%'],
      ['150', '150%'],
      ['200', '200%'],
    ].forEach(function (o) {
      zsel.appendChild(h('option', { value: o[0] }, o[1]));
    });
    zsel.value = 'fitw';
    zsel.addEventListener('change', function () {
      var v = zsel.value;
      if (v === 'fitw') {
        trackMode = 'fitw';
        tracking = true;
        fitWidth();
      } else if (v === 'fitp') {
        trackMode = 'fitp';
        tracking = true;
        fitPage();
      } else {
        tracking = false;
        setPercent(parseInt(v, 10));
      }
    });
    zoomBox.appendChild(zsel);
  }

  // 파일 노드 호버 툴팁: 전체 경로 + 경로 복사 버튼. graph-shell 안에 두어 라우트 전환 시 함께 제거된다.
  var tip = buildFileTip(svg, function () {
    return view;
  });

  var groups = nodes.map(function (d) {
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'gnode gnode--' + d.type);
    var c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', d.type === 'file' ? 5 : 9);
    g.appendChild(c);
    var tx = document.createElementNS(NS, 'text');
    tx.setAttribute('x', 13);
    tx.setAttribute('y', 4);
    tx.textContent = d.label;
    g.appendChild(tx);
    // 파일 노드는 커스텀 툴팁이 경로를 보여주므로 네이티브 <title>은 개념·기능에만 둔다.
    if (d.type !== 'file') {
      var tt = document.createElementNS(NS, 'title');
      tt.textContent = d.title || d.label;
      g.appendChild(tt);
    }
    g.addEventListener('mousedown', function (ev) {
      ev.preventDefault();
      d.fixed = true;
      d.drag = false;
      function mv(e2) {
        var p = toLocal(e2);
        d.x = p.x;
        d.y = p.y;
        d.drag = true;
        heat = Math.max(heat, REHEAT); // 끌린 노드 주변만 다시 자리를 잡도록 약하게 데운다
      }
      function up() {
        window.removeEventListener('mousemove', mv);
        window.removeEventListener('mouseup', up);
        setTimeout(function () {
          d.drag = false;
        }, 0);
      }
      window.addEventListener('mousemove', mv);
      window.addEventListener('mouseup', up);
    });
    if (d.type === 'file') {
      g.addEventListener('mouseenter', function () {
        tip.show(d);
      });
      g.addEventListener('mouseleave', function () {
        tip.scheduleHide();
      });
    }
    if (d.href) {
      g.style.cursor = 'pointer';
      g.addEventListener('click', function () {
        if (!d.drag) window.location.hash = d.href.replace(/^#/, '');
      });
    }
    gN.appendChild(g);
    return g;
  });
  // 배치 물리의 세기(heat). 1에서 시작해 매 프레임 조금씩 식으며, MIN_HEAT 아래로 내려가면
  // 계산을 멈춰 그래프가 완전히 정지한다. 드래그처럼 배치가 흐트러지는 조작에만 약하게 다시 데운다.
  var heat = 1;
  var COOLING = 0.98; // 프레임당 감쇠 — 약 3초면 정지
  var MIN_HEAT = 0.02; // 이 아래는 정지로 간주
  var REHEAT = 0.25; // 드래그 시 되살리는 세기(초기의 1/4)
  var DAMPING = 0.8; // 속도 감쇠 — 높을수록 출렁인다
  var MAX_SPEED = 3; // 프레임당 최대 이동(px)
  var MAX_REPULSION = 1.5; // 반발력 상한 — 노드가 겹쳐도 튕겨나가지 않게 한다
  function tick() {
    if (gen !== renderGen) return; // 라우트가 바뀌면 루프 종료
    if (heat > MIN_HEAT) {
      for (var i = 0; i < nodes.length; i++)
        for (var j = i + 1; j < nodes.length; j++) {
          var a = nodes[i],
            b = nodes[j],
            dx = a.x - b.x,
            dy = a.y - b.y,
            d2 = dx * dx + dy * dy + 0.01,
            dd = Math.sqrt(d2),
            // 반발력에 상한을 둔다 — 상한이 없으면 두 노드가 겹칠 때 힘이 발산해 서로 튕겨낸다.
            f = Math.min(2600 / d2, MAX_REPULSION) * heat;
          a.vx += (dx / dd) * f;
          a.vy += (dy / dd) * f;
          b.vx -= (dx / dd) * f;
          b.vy -= (dy / dd) * f;
        }
      edges.forEach(function (e) {
        var dx = e.t.x - e.s.x,
          dy = e.t.y - e.s.y,
          dd = Math.sqrt(dx * dx + dy * dy) + 0.01,
          f = (dd - 96) * 0.02 * heat;
        e.s.vx += (dx / dd) * f;
        e.s.vy += (dy / dd) * f;
        e.t.vx -= (dx / dd) * f;
        e.t.vy -= (dy / dd) * f;
      });
      nodes.forEach(function (d) {
        d.vx += (W / 2 - d.x) * 0.002 * heat;
        d.vy += (H / 2 - d.y) * 0.002 * heat;
        d.vx *= DAMPING;
        d.vy *= DAMPING;
        // 속도 상한 — 한 프레임에 크게 도약해 시선을 끄는 움직임을 막는다.
        var sp = Math.sqrt(d.vx * d.vx + d.vy * d.vy);
        if (sp > MAX_SPEED) {
          d.vx = (d.vx / sp) * MAX_SPEED;
          d.vy = (d.vy / sp) * MAX_SPEED;
        }
        if (!d.fixed) {
          d.x += d.vx;
          d.y += d.vy;
        }
        // 경계에 닿으면 해당 축 속도를 죽인다 — 남겨두면 벽을 밀며 떠는 움직임이 된다.
        var cx = Math.max(24, Math.min(W - 24, d.x));
        var cy = Math.max(24, Math.min(H - 24, d.y));
        if (cx !== d.x) d.vx = 0;
        if (cy !== d.y) d.vy = 0;
        d.x = cx;
        d.y = cy;
      });
      lines.forEach(function (l, i) {
        var e = edges[i];
        l.setAttribute('x1', e.s.x);
        l.setAttribute('y1', e.s.y);
        l.setAttribute('x2', e.t.x);
        l.setAttribute('y2', e.t.y);
      });
      groups.forEach(function (g, i) {
        g.setAttribute('transform', 'translate(' + nodes[i].x + ',' + nodes[i].y + ')');
      });
      heat *= COOLING; // 식히기: 초기 정렬을 마치면 스스로 멎는다
    }
    if (tracking) {
      trackMode === 'fitp' ? fitPage() : fitWidth();
    } // 팬하기 전까지 배치 추적
    tip.reposition(); // 노드가 움직이는 동안 툴팁을 따라붙인다
    requestAnimationFrame(tick);
  }
  if (data.nodes.length) requestAnimationFrame(tick);
}

// 파일 노드 호버 툴팁 빌더: 전체 경로 표시 + 경로 복사 버튼. 노드 좌표(현재 뷰박스 기준)를
// 화면 좌표로 변환해 fixed 위치에 띄우고, 노드↔툴팁 사이 이동을 허용하도록 지연 숨김한다.
function buildFileTip(svg, getView) {
  var el = document.createElement('div');
  el.className = 'gtip';
  el.style.display = 'none';
  var pathEl = document.createElement('span');
  pathEl.className = 'gtip__path';
  var copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'gtip__copy';
  copyBtn.textContent = state.t.copyPath;
  el.appendChild(copyBtn);
  el.appendChild(pathEl); // 복사 버튼을 경로 좌측에 둔다
  (svg.parentNode || document.body).appendChild(el);

  var active = null,
    hideTimer = null,
    btnTimer = null;
  function place() {
    if (!active) return;
    var r = svg.getBoundingClientRect();
    var v = getView();
    el.style.left = r.left + ((active.x - v.x) / v.w) * r.width + 12 + 'px';
    el.style.top = r.top + ((active.y - v.y) / v.h) * r.height - 8 + 'px';
  }
  function hide() {
    active = null;
    el.style.display = 'none';
  }
  function clearHide() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }
  function flashBtn(label) {
    copyBtn.textContent = label;
    if (btnTimer) clearTimeout(btnTimer);
    btnTimer = setTimeout(function () {
      copyBtn.textContent = state.t.copyPath;
    }, 1200);
  }
  copyBtn.addEventListener('click', function () {
    copyText(pathEl.textContent)
      .then(function () {
        flashBtn(state.t.copied);
      })
      .catch(function () {
        flashBtn(state.t.copyFailed);
      });
  });
  el.addEventListener('mouseenter', clearHide);
  el.addEventListener('mouseleave', hide);
  return {
    show: function (d) {
      clearHide();
      active = d;
      pathEl.textContent = d.title;
      copyBtn.textContent = state.t.copyPath;
      el.style.display = 'flex';
      place();
    },
    scheduleHide: function () {
      clearHide();
      hideTimer = setTimeout(hide, 180);
    },
    reposition: function () {
      if (active) place();
    },
  };
}

// ---- 에러/미발견 ----
function renderError() {
  renderGen++;
  setApp(h('div', { class: 'wrap' }, [h('p', { class: 'muted' }, state.t.loadError), pagenav()]));
}
function renderMissing() {
  renderGen++;
  setApp(h('div', { class: 'wrap' }, [h('p', { class: 'muted' }, state.t.notFound), pagenav()]));
}

// ---- 라우터 ----
function route() {
  renderGen++; // 이전 그래프 루프 중단
  var hash = window.location.hash.replace(/^#/, '') || '/';
  var parts = hash.split('/').filter(Boolean); // ['concept','slug'] 등
  if (parts[0] === 'concept' && parts[1]) return viewConcept(decodeURIComponent(parts[1]));
  if (parts[0] === 'feature' && parts[1]) return viewFeature(decodeURIComponent(parts[1]));
  if (parts[0] === 'graph') return viewGraph(parts[1] ? decodeURIComponent(parts[1]) : null);
  if (parts[0] === 'group' && parts[1]) return viewIndex(decodeURIComponent(parts[1]));
  if (parts[0] === 'architecture') return viewDoc('architecture');
  if (parts[0] === 'infra') return viewDoc('infra');
  return viewIndex();
}

// 편집 가능 여부 감지: 쓰기 서버(serve.mjs)면 /api/health가 응답한다.
// 정적 배포(서버 없음)면 실패 → 읽기 전용으로 동작.
function detectEditable() {
  return fetch('/api/health', { cache: 'no-store' })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (j) {
      state.editable = !!(j && j.editable);
    })
    .catch(function () {
      state.editable = false;
    });
}

function boot() {
  Promise.all([fetchJson('manifest.json'), detectEditable()])
    .then(function (res) {
      var m = res[0];
      state.manifest = m;
      // UI 문구는 기본 영어. 개념/기능 본문(data/*.json)은 작성된 언어 그대로 렌더되며,
      // UI 언어만 바꾸려면 manifest의 uiLocale(예: 'ko')을 지정한다.
      state.t = I18N[m.uiLocale] || I18N.en;
      document.documentElement.lang = m.locale || 'en';
      window.addEventListener('hashchange', route);
      route();
    })
    .catch(function () {
      var app = document.getElementById('app');
      app.textContent = '';
      app.appendChild(h('div', { class: 'wrap' }, h('p', { class: 'muted' }, I18N.en.loadError)));
    });
}

boot();
