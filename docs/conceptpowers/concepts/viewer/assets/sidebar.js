// @concept:none
// assets/sidebar.js — 개념/기능 상세 화면 좌측 사이드바(목록) 열고/닫기.
// viewer.js가 정의하는 h()/state/displayName/conceptListSections/featureListSection에 의존한다.
// 로드 순서: index.html에서 sidebar.js를 viewer.js보다 먼저 로드한다(전역 의존은
// 호출 시점에만 필요하므로 순서 자체는 안전하지만, 스펙이 지정한 순서를 따른다).
'use strict';

var CPSidebar = (function () {
  var STORAGE_KEY = 'cp.sidebar.open';
  var BREAKPOINT = 1280;
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

  function isOpen() {
    var stored = readStored();
    if (stored === '1') return true;
    if (stored === '0') return false;
    return window.innerWidth >= BREAKPOINT;
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
      // 상세 화면을 떠나면 currentShell은 분리된 노드가 된다 — 그때의 Esc는 무시해야
      // 사용자가 명시적으로 닫지 않은 상태를 localStorage에 쓰지 않는다.
      if (currentShell && !currentShell.isConnected) currentShell = null;
      if (currentShell && currentShell.classList.contains('shell--open')) setOpen(false);
    });
  }

  function sidebarListNode(activeKind, activeSlug) {
    var t = state.t;
    var active = { kind: activeKind, slug: activeSlug };
    var sections = conceptListSections(active);
    var featureSection = featureListSection(active);
    var body = sections.length ? sections : [h('p', { class: 'muted' }, t.empty)];
    return h('div', { class: 'side__list' }, [body, featureSection]);
  }

  function shell(activeKind, activeSlug, wrapNode) {
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
    var backdrop = h('div', { class: 'side-backdrop' });
    backdrop.addEventListener('click', function () {
      setOpen(false);
    });
    var aside = h('aside', { id: 'cp-side', class: 'side' }, [
      h('div', { class: 'side__head' }, [h('strong', null, t.conceptList), closeBtn]),
      sidebarListNode(activeKind, activeSlug),
    ]);
    var body = h('div', { class: 'shell__body' }, [aside, backdrop, wrapNode]);
    var topbar = h('div', { class: 'shell__topbar' }, [toggleBtn]);
    var shellEl = h('div', { class: 'shell' + (open ? ' shell--open' : '') }, [topbar, body]);
    currentShell = shellEl;
    return shellEl;
  }

  return { isOpen: isOpen, setOpen: setOpen, shell: shell };
})();
