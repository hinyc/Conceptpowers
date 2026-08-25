// @concept:home-search @concept:viewer-navigation @concept:viewer-readability
// assets/sidebar.js — 개념 상세 화면 좌측 곁 목록(넓은 화면 전용) 열고/닫기.
// 좁은 화면에서는 곁 목록 대신 상단 묶음 메뉴(topnav.js, viewer-navigation)가 목록 역할을 한다.
// viewer.js가 정의하는 h()/state/displayName/conceptListSections와
// topnav.js의 CPTopnav에 의존한다. 로드 순서: index.html에서 sidebar.js를 viewer.js보다
// 먼저 로드한다(전역 의존은 호출 시점에만 필요하므로 순서 자체는 안전하다).
'use strict';

var CPSidebar = (function () {
  var STORAGE_KEY = 'cp.sidebar.open';
  var currentShell = null;
  var escBound = false;

  function readStored() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function writeStored(open) {
    try {
      window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
    } catch (e) {
      /* 사생활 모드 등 저장 실패는 무시(이번 방문 동안은 그래도 DOM 상태는 반영됨) */
    }
  }

  // 기본값은 열림 — 곁 목록은 넓은 화면에서만 보이므로 너비는 더 보지 않는다.
  // 사람이 직접 닫은 적이 있으면 그 선택을 우선한다(viewer-navigation).
  function isOpen() {
    var stored = readStored();
    if (stored === '0') return false;
    return true;
  }

  function applyOpenState(open) {
    if (!currentShell) return;
    currentShell.classList.toggle('shell--open', open);
    var btn = currentShell.querySelector('.side-toggle');
    if (btn) {
      var label = open ? state.t.sidebarCloseLabel : state.t.sidebarOpenLabel;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
  }

  function setOpen(open) {
    writeStored(open);
    applyOpenState(open);
  }

  function ensureEscHandler() {
    if (escBound) return;
    escBound = true;
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      // 상단 묶음 메뉴가 펼쳐져 있으면 그쪽이 먼저 닫힌다(viewer-navigation와의 층 순서).
      if (typeof CPTopnav !== 'undefined' && CPTopnav.isMenuOpen()) return;
      // 상세 화면을 떠나면 currentShell은 분리된 노드가 된다 — 그때의 Esc는 무시해야
      // 사용자가 명시적으로 닫지 않은 상태를 localStorage에 쓰지 않는다.
      if (currentShell && !currentShell.isConnected) currentShell = null;
      if (currentShell && currentShell.classList.contains('shell--open')) setOpen(false);
    });
  }

  // 곁 목록에는 지금 보고 있는 항목이 속한 묶음만 담는다 — 다른 묶음은 상단 묶음 메뉴로 간다.
  function sidebarListNode(activeSlug) {
    var t = state.t;
    // 곁 목록에 서는 것은 개념뿐이다(feature-index-row) — 종류는 여기서 정한다.
    var active = { kind: 'concept', slug: activeSlug };
    var activeGroup = CPTopnav.activeGroupKey(state.manifest, active);
    var sections = conceptListSections(active, true, activeGroup);
    var body = sections.length ? sections : [h('p', { class: 'muted' }, t.empty)];
    return h('div', { class: 'side__list' }, body);
  }

  function matchesQuery(text, q) {
    q = String(q || '')
      .trim()
      .toLowerCase();
    if (!q) return true;
    return (
      String(text || '')
        .toLowerCase()
        .indexOf(q) !== -1
    );
  }

  function filterSideList(listNode, noResultsNode, q) {
    var anyGroupVisible = false;
    var groups = listNode.querySelectorAll('.group');
    for (var i = 0; i < groups.length; i++) {
      var group = groups[i];
      var items = group.querySelectorAll('li');
      var anyItemVisible = false;
      for (var j = 0; j < items.length; j++) {
        var li = items[j];
        var visible = matchesQuery(li.textContent, q);
        li.style.display = visible ? '' : 'none';
        if (visible) anyItemVisible = true;
      }
      group.style.display = anyItemVisible ? '' : 'none';
      if (anyItemVisible) anyGroupVisible = true;
    }
    var hasQuery = !!String(q || '').trim();
    noResultsNode.style.display = !hasQuery || anyGroupVisible ? 'none' : '';
  }

  function shell(activeSlug, wrapNode) {
    var t = state.t;
    ensureEscHandler();
    var open = isOpen();
    var toggleLabel = open ? t.sidebarCloseLabel : t.sidebarOpenLabel;
    var toggleBtn = h(
      'button',
      {
        type: 'button',
        class: 'side-toggle',
        'aria-expanded': open ? 'true' : 'false',
        'aria-controls': 'cp-side',
        'aria-label': toggleLabel,
        title: toggleLabel,
      },
      '☰'
    );
    toggleBtn.addEventListener('click', function () {
      setOpen(!toggleBtn.closest('.shell').classList.contains('shell--open'));
    });
    var closeBtn = h(
      'button',
      { type: 'button', class: 'side-close', 'aria-label': t.closeSidebar, title: t.closeSidebar },
      '✕'
    );
    closeBtn.addEventListener('click', function () {
      setOpen(false);
    });
    var listNode = sidebarListNode(activeSlug);
    var noResultsNode = h(
      'p',
      { class: 'muted side-noresults', style: 'display:none' },
      t.noResults
    );
    var searchIn = h('input', {
      type: 'search',
      class: 'side-search',
      placeholder: t.sidebarSearchPh,
      'aria-label': t.sidebarSearchPh,
    });
    searchIn.addEventListener('input', function () {
      filterSideList(listNode, noResultsNode, searchIn.value);
    });
    searchIn.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (!searchIn.value) return;
      ev.stopPropagation();
      searchIn.value = '';
      filterSideList(listNode, noResultsNode, '');
    });
    var aside = h('aside', { id: 'cp-side', class: 'side' }, [
      h('div', { class: 'side__head' }, [h('strong', null, t.conceptList), closeBtn]),
      h('div', { class: 'side__search' }, [searchIn]),
      listNode,
      noResultsNode,
    ]);
    var body = h('div', { class: 'shell__body' }, [aside, wrapNode]);
    var topbar = h('div', { class: 'shell__topbar' }, [
      toggleBtn,
      CPTopnav.bar({ kind: 'concept', slug: activeSlug }),
    ]);
    var shellEl = h('div', { class: 'shell' + (open ? ' shell--open' : '') }, [topbar, body]);
    currentShell = shellEl;
    return shellEl;
  }

  return { isOpen: isOpen, setOpen: setOpen, shell: shell, matchesQuery: matchesQuery };
})();
