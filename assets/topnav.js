// @concept:viewer-navigation @concept:viewer-readability
// assets/topnav.js — 상단 묶음 메뉴. 묶음 이름을 한 줄로 나열하고, 올리거나 누르면
// 그 묶음의 항목이 아래로 펼쳐진다(본문을 밀어내지 않고 위에 뜬다).
// viewer.js가 정의하는 h()/state/statusDot/statusLegend/sideItem에 의존한다
// (전역 의존은 호출 시점에만 필요 — sidebar.js와 같은 패턴).
'use strict';

var CPTopnav = (function () {
  var openItem = null; // 현재 펼쳐진 .topnav__item (한 번에 하나만)
  var bound = false;

  // manifest → [{key, items:[{slug, title, status}]}] — 개념 묶음 순서대로.
  // 기능은 펼쳐 볼 화면이 없어(feature-index-row) 이 줄에 묶음으로 들어오지 않는다.
  // 순수 함수라 DOM 없이 검증할 수 있다.
  function groupsOf(manifest) {
    var order = [];
    var byKey = {};
    ((manifest && manifest.concepts) || []).forEach(function (c) {
      var key = c.group || '(ungrouped)';
      if (!byKey[key]) {
        byKey[key] = { key: key, items: [] };
        order.push(byKey[key]);
      }
      byKey[key].items.push({ slug: c.slug, title: c.title, status: c.status });
    });
    return order;
  }

  // active({kind, slug}) → 그 항목이 속한 묶음 key. 못 찾으면 null.
  function activeGroupKey(manifest, active) {
    if (!active) return null;
    var found = ((manifest && manifest.concepts) || []).filter(function (c) {
      return c.slug === active.slug;
    })[0];
    return found ? found.group || '(ungrouped)' : null;
  }

  function setOpen(item, open) {
    if (!item) return;
    item.classList.toggle('topnav__item--open', open);
    var btn = item.querySelector('.topnav__btn');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function close() {
    if (!openItem) return;
    setOpen(openItem, false);
    openItem = null;
  }

  function openMenu(item) {
    if (openItem === item) return;
    close();
    openItem = item;
    setOpen(item, true);
  }

  function isMenuOpen() {
    if (openItem && !openItem.isConnected) openItem = null; // 라우트 이동으로 분리된 노드 정리
    return !!openItem;
  }

  // Esc·바깥 누름으로 닫기 — 문서 전역에 1회만 바인딩.
  function ensureGlobalHandlers() {
    if (bound) return;
    bound = true;
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape' || !isMenuOpen()) return;
      ev.stopImmediatePropagation(); // 곁 목록(viewer-navigation)의 Esc보다 펼침 목록이 먼저 닫힌다
      close();
    });
    document.addEventListener('click', function (ev) {
      if (!isMenuOpen()) return;
      var target = ev.target;
      if (target && target.closest && target.closest('.topnav__item') === openItem) return;
      close();
    });
  }

  // 펼침 목록 항목 — 훑기와 읽기(viewer-readability): 상태 동그라미 + 나뉜 이름표·제목.
  function panelItem(entry) {
    var li = h('li', null, [
      statusDot(entry.status),
      sideItem('#/concept/' + entry.slug, entry.slug, entry.title, false),
    ]);
    li.addEventListener('click', close); // 항목을 고르면 펼침 목록은 닫힌다
    return li;
  }

  function navItem(group, label, isActiveGroup) {
    var btn = h(
      'button',
      {
        type: 'button',
        class: 'topnav__btn',
        'aria-expanded': 'false',
        'aria-haspopup': 'true',
      },
      label
    );
    var panel = h('div', { class: 'topnav__panel' }, [
      h('ul', { class: 'topnav__menu' }, group.items.map(panelItem)),
      h('div', { class: 'topnav__legend' }, statusLegend()),
    ]);
    var item = h(
      'div',
      { class: 'topnav__item' + (isActiveGroup ? ' topnav__item--active' : '') },
      [btn, panel]
    );
    btn.addEventListener('click', function () {
      if (openItem === item) close();
      else openMenu(item);
    });
    // 마우스 올림으로도 열린다(누름·키보드와 동등). 벗어나면 닫는다.
    item.addEventListener('mouseenter', function () {
      openMenu(item);
    });
    item.addEventListener('mouseleave', function () {
      if (openItem === item) close();
    });
    return item;
  }

  // active: null 또는 { kind: 'concept', slug } — 현재 위치의 묶음 강조.
  function bar(active) {
    var t = state.t;
    ensureGlobalHandlers();
    var m = state.manifest;
    var groups = groupsOf(m);
    if (!groups.length) return null;
    var activeKey = activeGroupKey(m, active);
    return h(
      'nav',
      { class: 'topnav', 'aria-label': t.topnavLabel },
      groups.map(function (g) {
        return navItem(g, g.key, g.key === activeKey);
      })
    );
  }

  return {
    bar: bar,
    groupsOf: groupsOf,
    activeGroupKey: activeGroupKey,
    isMenuOpen: isMenuOpen,
    close: close,
  };
})();
