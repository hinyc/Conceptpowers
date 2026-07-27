# 뷰어 개념 상세 사이드바 토글 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a left sidebar (grouped concept list + feature list) to the viewer's concept-detail (read/edit) and feature-detail screens, with a toggle that's open by default at ≥1280px and closed by default below it, remembering the user's last explicit choice in `localStorage`.

**Architecture:** A new plain-script asset `assets/sidebar.js` exposes a `CPSidebar` global with pure open/closed state logic (`isOpen`/`setOpen`, backed by `localStorage` + `window.innerWidth`) and a `shell()` DOM builder that wraps the existing per-page content (`wrapNode`) with a sidebar + toggle + backdrop. `assets/viewer.js` gets two small extracted helpers (`conceptListSections`, `featureListSection`) that both the existing list page and the new sidebar reuse, plus the three detail-rendering functions call `CPSidebar.shell(...)` instead of building a bare `.wrap` div. CSS handles the two layouts (docked panel ≥1280px, overlay drawer below) via one `.shell--open` class that JS toggles.

**Tech Stack:** Vanilla JS (ES5-style, no build step for `assets/*.js`), plain CSS, Vitest + `node:vm` for testing pure logic in plain-script assets (existing pattern, see `tests/viewer/subgraph.test.ts`).

## Global Constraints

- Breakpoint is exactly `1280` (px) — matches the design's approved answer and the CSS `--maxw` var (coincidental, unrelated concerns, both hardcoded to 1280).
- `assets/viewer.js`, `assets/sidebar.js`, `assets/concept.css`, `assets/index.html` all carry `@concept:none` / are outside conceptpowers governance (per `docs/superpowers/specs/2026-07-27-viewer-concept-sidebar-design.md` background) — no `@concept` tag needed on the new file.
- `assets/*.js` is plain sloppy-mode script (no ESM `import`/`export`), loaded via `<script src>` tags in `assets/index.html`. Follow the existing style in `assets/viewer.js` exactly (`var`, `function` declarations, `h()`/`append()` DOM helper, event listeners via `addEventListener`, no arrow functions, no template literals — this file already uses them sparingly but stay consistent with surrounding code).
- Coverage gate (`vitest.config.ts`: `coverage.include: ['src/**'], lines: 80`) only measures `src/**`. `assets/*.js` has zero DOM-rendering test coverage today (confirmed: no jsdom in this project) — only pure/logic functions get `node:vm` tests (existing precedent: `subgraphFor` in `tests/viewer/subgraph.test.ts`). Follow that same boundary: test `CPSidebar.isOpen`/`setOpen` via `node:vm`, verify the DOM-building refactor by careful reading + manual browser check (Task 4), not by inventing a new DOM test harness.
- Never edit `docs/conceptpowers/concepts/**/*.json` (baseline) by hand. Only `docs/conceptpowers/concepts/viewer/assets/*` and `docs/conceptpowers/concepts/viewer/index.html` regenerate via `node dist/cli.js render` (a generated mirror of `assets/*`), which Task 4 runs.
- Run `pnpm format` is not required (no configured pre-commit hook mentioned beyond prettier availability) but keep formatting consistent with surrounding code manually (2-space indent, single quotes, semicolons — matches `assets/viewer.js`).

---

### Task 1: Extract shared list-section helpers in `assets/viewer.js` (pure refactor)

**Files:**
- Modify: `assets/viewer.js:658-742` (the `// ---- 뷰: 목록 ----` block and `viewIndex`)

**Interfaces:**
- Produces (new globals, used by Task 3 and by `assets/sidebar.js` in Task 2/3):
  - `conceptListSections(active)` → `Element[]` — one `<section class="group" id="g-<group>">` per concept group (unchanged visual output vs. today). `active` is `null` or `{ kind: 'concept'|'feature', slug: string }`; when `active.kind === 'concept'` and a row's slug matches `active.slug`, that `<li>` gets `class="active"` and its `<a>` gets `aria-current="page"`.
  - `featureListSection(active)` → `Element | null` — the `<section class="group" id="g-__features">` (or `null` if there are no features), same active-highlight rule but keyed on `active.kind === 'feature'`.
- Consumes: existing globals `h`, `state`, `statusBadge`, `displayName` (all already defined earlier in `assets/viewer.js`).

- [ ] **Step 1: Replace the list-view block**

Open `assets/viewer.js` and locate the block starting at the comment `// ---- 뷰: 목록 ----` (currently line 658) through the end of `viewIndex` (currently line 742, right before the blank line and `// ---- 뷰: 개념 상세 ----`). Replace that entire block with:

```javascript
// ---- 뷰: 목록 ----
// active: null 또는 { kind: 'concept'|'feature', slug } — 사이드바에서 현재 보고 있는 항목 강조용.
function conceptListSections(active) {
  var m = state.manifest;
  var groups = {};
  (m.concepts || []).forEach(function (c) {
    var g = c.group || '(ungrouped)';
    (groups[g] = groups[g] || []).push(c);
  });
  return Object.keys(groups).map(function (g) {
    return h('section', { class: 'group', id: 'g-' + g }, [
      h('h2', null, g),
      h(
        'ul',
        null,
        groups[g].map(function (c) {
          var isActive = !!(active && active.kind === 'concept' && active.slug === c.slug);
          return h('li', { class: isActive ? 'active' : null }, [
            statusBadge(c.status),
            ' ',
            h(
              'a',
              { href: '#/concept/' + c.slug, 'aria-current': isActive ? 'page' : null },
              displayName(c.title, c.slug)
            ),
            ' ',
            h('small', null, (c.category || []).join(', ')),
          ]);
        })
      ),
    ]);
  });
}
function featureListSection(active) {
  var t = state.t;
  var m = state.manifest;
  if (!(m.features || []).length) return null;
  return h('section', { class: 'group', id: 'g-__features' }, [
    h('h2', null, t.featureList),
    h(
      'ul',
      null,
      m.features.map(function (f) {
        var isActive = !!(active && active.kind === 'feature' && active.slug === f.slug);
        return h('li', { class: isActive ? 'active' : null }, [
          h(
            'a',
            { href: '#/feature/' + f.slug, 'aria-current': isActive ? 'page' : null },
            displayName(f.title, f.slug)
          ),
          ' ',
          h('small', null, String(f.codePathCount)),
        ]);
      })
    ),
  ]);
}
// scrollTo: 그룹 이름(또는 '__features') — #/group/:g 라우트로 진입하면 해당 섹션으로 스크롤.
function viewIndex(scrollTo) {
  var t = state.t;
  var m = state.manifest;
  var sections = conceptListSections(null);
  var featureSection = featureListSection(null);
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
        h('h1', null, t.appTitle),
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
```

This is a behavior-preserving extraction: `viewIndex`'s rendered output is byte-for-byte the same as before (the only functional difference is the new optional `active` parameter, which `viewIndex` always calls with `null`, so `isActive` is always `false` there — no visible change).

- [ ] **Step 2: Sanity-check with the existing test suite**

Run: `pnpm test`
Expected: all existing tests still PASS (this file isn't covered by the coverage gate or any DOM test, so this step is a regression check on `src/**`, which is untouched — should be a no-op confirmation).

- [ ] **Step 3: Commit**

```bash
git add assets/viewer.js
git commit -m "refactor: extract conceptListSections/featureListSection helpers in viewer.js"
```

---

### Task 2: `assets/sidebar.js` — open/closed state logic + tests

**Files:**
- Create: `assets/sidebar.js`
- Test: `tests/viewer/sidebarState.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 yet (this task only implements `isOpen`/`setOpen`, which are pure `window.localStorage` + `window.innerWidth` logic — no dependency on `h`/`state`/`conceptListSections`). The DOM-building `shell()` method (which *does* depend on those) is added in this same file but exercised/wired in Task 3.
- Produces: global `CPSidebar` object with:
  - `CPSidebar.isOpen(): boolean`
  - `CPSidebar.setOpen(open: boolean): void`
  - `CPSidebar.shell(activeKind: 'concept'|'feature', activeSlug: string, wrapNode: Element): Element` (built now, used by Task 3)

- [ ] **Step 1: Write the failing test**

Create `tests/viewer/sidebarState.test.ts`:

```typescript
// tests/viewer/sidebarState.test.ts
// CPSidebar.isOpen/setOpen(assets/sidebar.js)을 node:vm으로 로드해 검증한다.
// 순수 상태 판단(localStorage + width)만 하므로 DOM 없이 스텁으로 평가 가능.
// (동일 패턴: tests/viewer/subgraph.test.ts)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const viewerSrc = readFileSync(join(here, '../../assets/viewer.js'), 'utf8').replace(
  /\nboot\(\);?\s*$/,
  '\n'
);
const sidebarSrc = readFileSync(join(here, '../../assets/sidebar.js'), 'utf8');

function makeLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };
}

function loadSidebar(width: number) {
  const win: Record<string, unknown> = { innerWidth: width, localStorage: makeLocalStorage() };
  const ctx: Record<string, unknown> = { window: win, document: {} };
  vm.createContext(ctx);
  vm.runInContext(viewerSrc, ctx);
  vm.runInContext(sidebarSrc, ctx);
  return ctx.CPSidebar as { isOpen: () => boolean; setOpen: (open: boolean) => void };
}

describe('CPSidebar 열림 상태', () => {
  it('localStorage가 비어있고 폭이 1280 이상이면 기본 열림', () => {
    expect(loadSidebar(1280).isOpen()).toBe(true);
  });

  it('localStorage가 비어있고 폭이 1280 미만이면 기본 닫힘', () => {
    expect(loadSidebar(1279).isOpen()).toBe(false);
  });

  it('사용자가 닫으면 넓은 화면에서도 닫힘 상태를 유지한다', () => {
    const sidebar = loadSidebar(1920);
    sidebar.setOpen(false);
    expect(sidebar.isOpen()).toBe(false);
  });

  it('사용자가 열면 좁은 화면에서도 열림 상태를 유지한다', () => {
    const sidebar = loadSidebar(320);
    sidebar.setOpen(true);
    expect(sidebar.isOpen()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/viewer/sidebarState.test.ts`
Expected: FAIL — `assets/sidebar.js` does not exist yet (`ENOENT`).

- [ ] **Step 3: Write `assets/sidebar.js`**

Create `assets/sidebar.js`:

```javascript
// @concept:none
// assets/sidebar.js — 개념/기능 상세 화면 좌측 사이드바(목록) 열고/닫기.
// viewer.js가 정의하는 h()/state/displayName/conceptListSections/featureListSection에 의존한다.
// 로드 순서: index.html에서 viewer.js 다음에 로드.
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
      if (ev.key === 'Escape' && currentShell && currentShell.classList.contains('shell--open')) {
        setOpen(false);
      }
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
      setOpen(!currentShell.classList.contains('shell--open'));
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/viewer/sidebarState.test.ts`
Expected: PASS (4/4 tests)

- [ ] **Step 5: Commit**

```bash
git add assets/sidebar.js tests/viewer/sidebarState.test.ts
git commit -m "feat: add CPSidebar open/close state logic for viewer detail sidebar"
```

---

### Task 3: Wire the sidebar into detail screens + CSS + deploy plumbing

**Files:**
- Modify: `assets/index.html`
- Modify: `assets/viewer.js` (I18N keys + three `setApp` call sites)
- Modify: `assets/concept.css`
- Modify: `src/viewer/render.ts`
- Modify: `tests/viewer/renderDisk.test.ts`

**Interfaces:**
- Consumes: `conceptListSections`/`featureListSection` (Task 1), `CPSidebar.shell`/`isOpen`/`setOpen` (Task 2).
- Produces: nothing new for later tasks — this is the integration point.

- [ ] **Step 1: Load `sidebar.js` in the HTML shell**

In `assets/index.html`, change:

```html
    <script src="assets/viewer.js"></script>
```

to:

```html
    <script src="assets/viewer.js"></script>
    <script src="assets/sidebar.js"></script>
```

- [ ] **Step 2: Add sidebar i18n keys to both locales**

In `assets/viewer.js`, in the `ko` block of `I18N` (around line 77, right after `linesHint: '한 줄에 하나씩',`), add:

```javascript
    linesHint: '한 줄에 하나씩',
    sidebarOpenLabel: '개념 목록 열기',
    sidebarCloseLabel: '개념 목록 닫기',
    closeSidebar: '닫기',
```

In the `en` block (around line 148, right after `linesHint: 'one per line',`), add:

```javascript
    linesHint: 'one per line',
    sidebarOpenLabel: 'Open concept list',
    sidebarCloseLabel: 'Close concept list',
    closeSidebar: 'Close',
```

- [ ] **Step 3: Wire `renderConceptRead` through `CPSidebar.shell`**

In `assets/viewer.js`, inside `renderConceptRead` (currently ends around line 912), change the final line:

```javascript
  setApp(h('div', { class: 'wrap' }, sections));
```

to:

```javascript
  setApp(CPSidebar.shell('concept', slug, h('div', { class: 'wrap' }, sections)));
```

- [ ] **Step 4: Wire `renderConceptEdit` through `CPSidebar.shell`**

In `assets/viewer.js`, inside `renderConceptEdit`, change:

```javascript
  setApp(
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
  );
```

to (wrap the existing `h('div', { class: 'wrap' }, [...])` argument with `CPSidebar.shell('concept', slug, ...)`):

```javascript
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
```

- [ ] **Step 5: Wire `viewFeature` through `CPSidebar.shell`**

In `assets/viewer.js`, inside `viewFeature`'s `.then(function (f) { ... })` callback, change:

```javascript
      setApp(
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
      );
```

to:

```javascript
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
```

- [ ] **Step 6: Add sidebar layout CSS**

In `assets/concept.css`, insert the following block immediately after the `.wrap { ... }` rule (currently lines 52–56, right before the `/* 경로 내비게이션 (breadcrumbs) */` comment):

```css
/* 상세 화면 좌측 사이드바(개념·기능 목록) 열기/닫기 */
.shell__topbar {
  max-width: var(--maxw);
  margin: 0 auto;
  padding: 14px 10px 0;
}
.side-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--fg);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}
.side-toggle:hover {
  border-color: var(--link);
}
.shell__body {
  position: relative;
}
.side {
  display: none;
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  width: min(320px, 86vw);
  background: var(--bg);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 16px;
  z-index: 40;
  transform: translateX(-100%);
  transition: transform 0.2s ease;
}
.shell--open .side {
  display: block;
  transform: translateX(0);
}
.side__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.side-close {
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 4px;
}
.side-close:hover {
  color: var(--fg);
}
.side .group {
  margin: 0 0 20px;
}
.side .group h2 {
  font-size: 0.72rem;
}
.side .group li {
  padding: 0.4rem 0.3rem;
}
.side .group a {
  font-size: 0.92rem;
}
.side .group small {
  display: block;
  margin-left: 0;
  font-size: 0.75rem;
}
.side .group li.active {
  background: color-mix(in srgb, var(--link) 14%, transparent);
  border-radius: 6px;
}
.side-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 35;
}
.shell--open .side-backdrop {
  display: block;
}

@media (min-width: 1280px) {
  .shell__topbar {
    max-width: calc(var(--maxw) + 300px);
  }
  .shell__body {
    display: flex;
    align-items: flex-start;
    gap: 28px;
    max-width: calc(var(--maxw) + 300px);
    margin: 0 auto;
    padding: 0 10px;
  }
  .side {
    position: sticky;
    top: 24px;
    left: auto;
    bottom: auto;
    flex: 0 0 260px;
    width: 260px;
    max-height: calc(100vh - 48px);
    border-right: none;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    transform: none;
    transition: none;
    z-index: 1;
  }
  .side-backdrop {
    display: none !important;
  }
  .shell__body > .wrap {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
  }
}
```

- [ ] **Step 7: Copy `sidebar.js` when rendering the viewer to disk**

In `src/viewer/render.ts`, inside `renderViewerToDisk`, change:

```typescript
  await copyAsset('index.html', join(p.conceptsViewer, 'index.html'));
  await copyAsset('viewer.js', join(p.conceptsViewer, 'assets', 'viewer.js'));
  await copyAsset('serve.mjs', join(p.conceptsViewer, 'serve.mjs'));
  await copyAsset('concept.css', p.cssTarget);
```

to:

```typescript
  await copyAsset('index.html', join(p.conceptsViewer, 'index.html'));
  await copyAsset('viewer.js', join(p.conceptsViewer, 'assets', 'viewer.js'));
  await copyAsset('sidebar.js', join(p.conceptsViewer, 'assets', 'sidebar.js'));
  await copyAsset('serve.mjs', join(p.conceptsViewer, 'serve.mjs'));
  await copyAsset('concept.css', p.cssTarget);
```

- [ ] **Step 8: Add a failing-first assertion for the new asset to `tests/viewer/renderDisk.test.ts`**

Read `tests/viewer/renderDisk.test.ts` fully first (it already has `it('단일 SPA 에셋(index.html, viewer.js, serve.mjs, css)을 디스크에 쓴다', ...)` around line 18, and `it('viewer.js와 index.html이 서로를 참조한다', ...)` around line 94). Add `sidebar.js` to both:

In the first test, next to the existing:
```typescript
  expect(existsSync(viewer('assets/viewer.js'))).toBe(true);
```
add immediately after it:
```typescript
  expect(existsSync(viewer('assets/sidebar.js'))).toBe(true);
```

In the second test (`'viewer.js와 index.html이 서로를 참조한다'`), next to the existing:
```typescript
  expect(readFileSync(viewer('index.html'), 'utf8')).toContain('assets/viewer.js');
```
add:
```typescript
  expect(readFileSync(viewer('index.html'), 'utf8')).toContain('assets/sidebar.js');
```

- [ ] **Step 9: Run the test to verify it fails, then passes**

Run: `npx vitest run tests/viewer/renderDisk.test.ts`
Expected (before Step 7's `render.ts` change is in place — if you did Step 7 already, skip straight to the pass check): FAIL, `assets/sidebar.js` not found.
After Step 7 is applied: PASS.

Run: `pnpm test`
Expected: all tests PASS (this also re-runs `tests/viewer/sidebarState.test.ts` from Task 2 and confirms Task 1's extraction didn't break `tests/viewer/subgraph.test.ts`, which loads the same `assets/viewer.js` file via `node:vm`).

- [ ] **Step 10: Typecheck and build**

Run: `pnpm typecheck`
Expected: no errors (only `src/viewer/render.ts` changed on the TS side, a one-line addition matching the existing `copyAsset` signature).

Run: `pnpm build`
Expected: succeeds, `dist/` rebuilt.

- [ ] **Step 11: Commit**

```bash
git add assets/index.html assets/viewer.js assets/concept.css src/viewer/render.ts tests/viewer/renderDisk.test.ts
git commit -m "feat: wire concept/feature detail sidebar into viewer with toggle + layout"
```

---

### Task 4: Regenerate the project's own viewer + manual verification

**Files:**
- Modify (generated, not baseline): `docs/conceptpowers/concepts/viewer/index.html`, `docs/conceptpowers/concepts/viewer/assets/*`

**Interfaces:**
- Consumes: `dist/cli.js render` (built in Task 3, Step 10) to regenerate this repo's own `docs/conceptpowers/concepts/viewer/` mirror — the same mechanism `syncGenerated` uses, per `src/viewer/render.ts`'s `renderViewerToDisk`.

- [ ] **Step 1: Regenerate this project's viewer artifacts**

Run: `node dist/cli.js render`
Expected: exits 0. Confirm the new file landed:

Run: `ls docs/conceptpowers/concepts/viewer/assets/sidebar.js`
Expected: file exists (freshly copied).

- [ ] **Step 2: Serve the viewer locally**

Run (background, since it's a long-running server): `pnpm concepts:view`

This starts `docs/conceptpowers/concepts/viewer/serve.mjs`, which opens the viewer in the default browser per `src/viewer/serve.ts`'s `startServer({ ..., open: true })` behavior.

- [ ] **Step 3: Manually verify in the browser**

At a window width **≥1280px**, open any concept detail page (e.g. click into a concept from the group list):
- Sidebar is open by default (docked on the left, concept groups + feature list visible).
- The current concept's row is visually highlighted (`.active`) in the sidebar.
- Clicking the toggle button collapses the sidebar; reloading the page keeps it collapsed (localStorage remembered).
- Clicking the toggle again re-opens it.

Resize the window to **<1280px** (or use browser devtools responsive mode) and reload a concept detail page fresh (clear `localStorage` key `cp.sidebar.open` first via devtools, or open in a private window):
- Sidebar is closed by default.
- Clicking the toggle opens it as an overlay drawer with a dimmed backdrop behind the main content.
- Clicking the backdrop, clicking the sidebar's own close button, or pressing `Esc` all close it.
- Reloading keeps whatever open/closed state was last set.

Navigate to a feature detail page (`#/feature/:slug`) and confirm the sidebar behaves identically, with the current feature row highlighted instead of a concept row.

Navigate back to the plain list page (`#/`) and the knowledge graph (`#/graph`) and confirm neither shows the sidebar/toggle — those two screens are unchanged (out of scope per the design).

- [ ] **Step 4: Stop the server**

Stop the `pnpm concepts:view` process (it was started for manual verification only, not meant to keep running).

- [ ] **Step 5: Commit the regenerated viewer artifacts**

```bash
git add docs/conceptpowers/concepts/viewer/
git status
```

Review the diff is limited to the generated viewer mirror (index.html/assets — same files `syncGenerated`/session-start sync already touches; this is expected and safe to commit per the project's own `<CONCEPTPOWERS-SYNC>` convention noted at session start).

```bash
git commit -m "chore: regenerate viewer artifacts with concept sidebar"
```

---

## Self-Review Notes

- **Spec coverage:** sidebar content (concept+feature groups) → Task 1/3. Applies to concept read/edit/feature detail only → Task 3 Steps 3–5 (index/graph untouched). ≥1280 default open / <1280 default closed → Task 2 (`isOpen`) + Task 3 CSS media query. `localStorage` remembers explicit toggles, not resize → Task 2 (`setOpen` only called from click handlers, never from a resize listener — there is no resize listener in this plan). Active-item highlight → Task 1 (`active` param) + CSS `.side .group li.active`.
- **Type consistency:** `CPSidebar.shell(activeKind, activeSlug, wrapNode)` signature is identical across Task 2 (definition) and Task 3 (all three call sites: `'concept'`/`'feature'` + `slug` + the pre-existing `.wrap` node). `conceptListSections`/`featureListSection` both take the same `active: {kind, slug}|null` shape in Task 1 and Task 2.
- **No placeholders:** every step has literal code, exact file paths, and exact run commands.
