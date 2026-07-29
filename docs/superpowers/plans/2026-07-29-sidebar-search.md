# 뷰어 사이드바 상단 검색창 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a search input at the top of the viewer's detail-screen sidebar (`CPSidebar.shell()`) that locally filters the already-rendered concept/feature list (no manifest re-fetch, no reuse of the home page's full search).

**Architecture:** `assets/sidebar.js` gets two new pure/DOM helpers inside the existing `CPSidebar` IIFE — `matchesQuery(text, q)` (case-insensitive substring match, pure) and `filterSideList(listNode, noResultsNode, q)` (walks `.group` sections and their `li`s, toggling `display`). `shell()` wires a new `<input class="side-search">` between the header and the list, calling `filterSideList` on every `input` event. `matchesQuery` is exposed on the returned `CPSidebar` object so it can be unit-tested via the existing `node:vm` pattern. A new i18n key (`sidebarSearchPh`) and two small CSS rules round it out.

**Tech Stack:** Vanilla JS (ES5-style, no build step for `assets/*.js`), plain CSS, Vitest + `node:vm` for testing pure logic in plain-script assets (existing pattern: `tests/viewer/sidebarState.test.ts`).

## Global Constraints

- `assets/viewer.js`, `assets/sidebar.js`, `assets/concept.css` all carry `@concept:none` (per `docs/superpowers/specs/2026-07-29-sidebar-search-design.md` background) — no `@concept` tag/mapping change needed.
- `assets/*.js` is plain sloppy-mode script (no ESM `import`/`export`), loaded via `<script src>` in `assets/index.html`. Follow existing style exactly: `var`, `function` declarations, `h()`/`append()` DOM helper, `addEventListener`, no arrow functions, no template literals, 2-space indent, single quotes, semicolons.
- Search is scoped to the sidebar's own already-rendered concept/feature list only — do **not** reuse `searchData`/`renderSearchResults` (home-page full search incl. file paths). This is an explicit non-goal from the design spec.
- No query persistence across navigation — `shell()` re-renders the input fresh on every route change, so no `localStorage` or extra state is needed for the query itself (unlike sidebar open/close state, which already persists and must not change).
- Coverage gate (`vitest.config.ts`: `coverage.include: ['src/**'], lines: 80`) does not cover `assets/**`. There is no jsdom in this project — only pure-logic functions (`matchesQuery`) get `node:vm` tests; DOM show/hide behavior (`filterSideList`) is verified manually in the browser (Task 4), matching the existing precedent for this file.
- Regenerate `docs/conceptpowers/concepts/viewer/**` via `node dist/cli.js render` after `pnpm build` (Task 4) — never hand-edit that directory or the baseline `docs/conceptpowers/concepts/**/*.json`.

---

### Task 1: Add `sidebarSearchPh` i18n key

**Files:**
- Modify: `assets/viewer.js:78-80` (ko block, after `closeSidebar`), `assets/viewer.js:152-154` (en block, after `closeSidebar`)
- Test: `tests/viewer/sidebarState.test.ts`

**Interfaces:**
- Produces: `I18N.ko.sidebarSearchPh` / `I18N.en.sidebarSearchPh` (strings), consumed by Task 2's `shell()`.
- Consumes: none new — reuses existing `I18N.ko.noResults` / `I18N.en.noResults` (already defined at `assets/viewer.js:39` / `:113`), no change needed there.

- [ ] **Step 1: Write the failing test**

Add to `tests/viewer/sidebarState.test.ts` (new `describe` block, after the existing `describe('CPSidebar 열림 상태', ...)`):

```typescript
describe('사이드바 검색 i18n', () => {
  it('ko/en 번역에 sidebarSearchPh 키가 있다', () => {
    const ctx: Record<string, unknown> = { window: { innerWidth: 1280, localStorage: makeLocalStorage() }, document: {} };
    vm.createContext(ctx);
    vm.runInContext(viewerSrc, ctx);
    const i18n = ctx.I18N as { ko: Record<string, string>; en: Record<string, string> };
    expect(i18n.ko.sidebarSearchPh).toBeTruthy();
    expect(i18n.en.sidebarSearchPh).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/viewer/sidebarState.test.ts`
Expected: FAIL — `i18n.ko.sidebarSearchPh` is `undefined`, `toBeTruthy()` assertion fails.

- [ ] **Step 3: Add the i18n key**

In `assets/viewer.js`, in the `ko` block, right after `closeSidebar: '닫기',` (currently line 80):

```javascript
    closeSidebar: '닫기',
    sidebarSearchPh: '개념 · 기능 검색',
```

In the `en` block, right after `closeSidebar: 'Close',` (currently line 154):

```javascript
    closeSidebar: 'Close',
    sidebarSearchPh: 'Search concepts · features',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/viewer/sidebarState.test.ts`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Commit**

```bash
git add assets/viewer.js tests/viewer/sidebarState.test.ts
git commit -m "feat: add sidebar search placeholder i18n key"
```

---

### Task 2: Filter the sidebar list from a search input

**Files:**
- Modify: `assets/sidebar.js` (inside the `CPSidebar` IIFE — add helpers, wire into `shell()`, extend the return statement)
- Test: `tests/viewer/sidebarState.test.ts`

**Interfaces:**
- Consumes: `I18N.ko/en.sidebarSearchPh` (Task 1), `I18N.ko/en.noResults` (existing), `h()`/`append()` from `assets/viewer.js` (already relied upon by this file).
- Produces: `CPSidebar.matchesQuery(text, q)` → `boolean` — exposed on the return object for testing. Internal (not exposed) `filterSideList(listNode, noResultsNode, q)` — DOM-only, no return value.

- [ ] **Step 1: Write the failing test**

Add to `tests/viewer/sidebarState.test.ts` (new `describe` block):

```typescript
describe('CPSidebar.matchesQuery', () => {
  it('빈 검색어는 항상 true', () => {
    expect(loadSidebar(1280).matchesQuery('아무 텍스트', '')).toBe(true);
    expect(loadSidebar(1280).matchesQuery('아무 텍스트', '   ')).toBe(true);
  });

  it('대소문자 무시 부분일치', () => {
    const sidebar = loadSidebar(1280);
    expect(sidebar.matchesQuery('Auth Flow', 'auth')).toBe(true);
    expect(sidebar.matchesQuery('Auth Flow', 'FLOW')).toBe(true);
    expect(sidebar.matchesQuery('Auth Flow', 'zzz')).toBe(false);
  });

  it('앞뒤 공백은 무시한다', () => {
    expect(loadSidebar(1280).matchesQuery('Payment', '  pay  ')).toBe(true);
  });

  it('text가 없어도 예외 없이 false를 반환한다', () => {
    expect(loadSidebar(1280).matchesQuery(null, 'x')).toBe(false);
  });
});
```

Note: `loadSidebar` (defined earlier in the same file, `tests/viewer/sidebarState.test.ts:31-38`) already returns the `CPSidebar` object typed as `{ isOpen; setOpen }`; extend that return type to include `matchesQuery`:

```typescript
function loadSidebar(width: number) {
  const win: Record<string, unknown> = { innerWidth: width, localStorage: makeLocalStorage() };
  const ctx: Record<string, unknown> = { window: win, document: {} };
  vm.createContext(ctx);
  vm.runInContext(viewerSrc, ctx);
  vm.runInContext(sidebarSrc, ctx);
  return ctx.CPSidebar as {
    isOpen: () => boolean;
    setOpen: (open: boolean) => void;
    matchesQuery: (text: string | null, q: string) => boolean;
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/viewer/sidebarState.test.ts`
Expected: FAIL — `sidebar.matchesQuery is not a function` (not yet exposed).

- [ ] **Step 3: Implement `matchesQuery` and `filterSideList`, wire into `shell()`**

In `assets/sidebar.js`, add the two functions right before `function shell(activeKind, activeSlug, wrapNode) {` (currently line 75):

```javascript
  function matchesQuery(text, q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return true;
    return String(text || '').toLowerCase().indexOf(q) !== -1;
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
    noResultsNode.style.display = anyGroupVisible ? 'none' : '';
  }

```

Then replace the body of `shell()` from the `var aside = ...` line through the `return shellEl;` line (currently lines 107-115) with:

```javascript
    var listNode = sidebarListNode(activeKind, activeSlug);
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
    var aside = h('aside', { id: 'cp-side', class: 'side' }, [
      h('div', { class: 'side__head' }, [h('strong', null, t.conceptList), closeBtn]),
      h('div', { class: 'side__search' }, [searchIn]),
      listNode,
      noResultsNode,
    ]);
    var body = h('div', { class: 'shell__body' }, [aside, backdrop, wrapNode]);
    var topbar = h('div', { class: 'shell__topbar' }, [toggleBtn]);
    var shellEl = h('div', { class: 'shell' + (open ? ' shell--open' : '') }, [topbar, body]);
    currentShell = shellEl;
    return shellEl;
```

Finally, extend the IIFE's return statement (currently `return { isOpen: isOpen, setOpen: setOpen, shell: shell };`, line 118) to:

```javascript
  return { isOpen: isOpen, setOpen: setOpen, shell: shell, matchesQuery: matchesQuery };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/viewer/sidebarState.test.ts`
Expected: PASS (all tests, including the new `matchesQuery` cases).

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: PASS — no regressions in `tests/viewer/renderDisk.test.ts` (it only checks that `assets/sidebar.js` exists and is referenced from `index.html`, not its contents) or elsewhere.

- [ ] **Step 6: Commit**

```bash
git add assets/sidebar.js tests/viewer/sidebarState.test.ts
git commit -m "feat: filter sidebar concept/feature list from a search input"
```

---

### Task 3: Style the sidebar search input

**Files:**
- Modify: `assets/concept.css:106-111` (insert new rules right after the `.side__head { ... }` block, before `.side-close`)

**Interfaces:**
- Consumes: CSS custom properties already defined elsewhere in this file (`--fg`, `--bg`, `--border`, `--link`) — same ones `.search-in` (line 445) already uses.
- Produces: `.side__search` (wrapper spacing) and `.side-search` / `.side-search:focus` (input look), consumed by the DOM built in Task 2.

- [ ] **Step 1: Add the CSS rules**

In `assets/concept.css`, right after the closing `}` of `.side__head { ... }` (currently ending line 111) and before `.side-close {` (currently line 112), insert:

```css
.side__search {
  margin: 0 0 12px;
}
.side-search {
  display: block;
  width: 100%;
  max-width: 100%;
  padding: 0.4rem 0.6rem;
  font: inherit;
  font-size: 0.88rem;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.side-search:focus {
  outline: none;
  border-color: var(--link);
}
```

- [ ] **Step 2: Run the full test suite (no CSS-specific tests exist, this just confirms no regressions)**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add assets/concept.css
git commit -m "style: add sidebar search input styling"
```

---

### Task 4: Rebuild, regenerate viewer artifacts, and verify manually in the browser

**Files:**
- Modify (generated, not hand-edited): `docs/conceptpowers/concepts/viewer/assets/sidebar.js`, `docs/conceptpowers/concepts/viewer/assets/viewer.js`, `docs/conceptpowers/concepts/viewer/assets/concept.css` (regenerated by the CLI's `render` command via `renderViewerToDisk`, `src/viewer/render.ts:82-85`)

**Interfaces:**
- Consumes: Tasks 1-3's finished `assets/*` files.
- Produces: nothing new — this task only propagates the finished assets to the generated viewer mirror and confirms the feature works end-to-end.

- [ ] **Step 1: Build**

Run: `pnpm build`
Expected: exits 0, `dist/` updated.

- [ ] **Step 2: Regenerate the viewer mirror**

Run: `node dist/cli.js render`
Expected: exits 0. Verify the three files changed:

Run: `git status --short docs/conceptpowers/concepts/viewer/`
Expected: shows modified `assets/sidebar.js`, `assets/viewer.js`, `assets/concept.css` (mirrors of the Task 1-3 edits) — no changes to `docs/conceptpowers/concepts/viewer/index.html` or anything under `docs/conceptpowers/concepts/data/` (baseline untouched).

- [ ] **Step 3: Manual browser verification**

Run: `pnpm concepts:view` (starts the local viewer server; note the printed port/URL).

In a browser, open a concept or feature detail page (e.g. `#/concept/<any-existing-slug>`) with the sidebar open, and confirm:
- A search input with placeholder "개념 · 기능 검색" appears between the sidebar title row and the list.
- Typing a substring of a visible concept/feature title hides all non-matching rows, and hides a whole group's heading when none of its rows match.
- Clearing the input restores the full list.
- Typing a query that matches nothing shows "검색 결과가 없습니다."
- Navigating to a different concept/feature resets the search input to empty.

If any check fails, fix the relevant Task (1-3) and re-run this task from Step 1.

- [ ] **Step 4: Commit the regenerated viewer mirror**

```bash
git add docs/conceptpowers/concepts/viewer/assets/sidebar.js docs/conceptpowers/concepts/viewer/assets/viewer.js docs/conceptpowers/concepts/viewer/assets/concept.css
git commit -m "chore: regenerate viewer artifacts with sidebar search"
```
