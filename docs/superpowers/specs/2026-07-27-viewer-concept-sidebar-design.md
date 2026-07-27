# 뷰어 개념 상세 사이드바 토글 — 설계

날짜: 2026-07-27
상태: 승인됨 (구현 대기)

## 배경 / 문제

Conceptpowers 뷰어(`assets/viewer.js` + `assets/concept.css`, 단일 SPA)는 개념 상세(`#/concept/:slug`), 편집(`#/concept/:slug` 편집 모드), 기능 상세(`#/feature/:slug`) 화면에서 `.wrap` 단일 컬럼만 렌더한다. 다른 개념/기능으로 이동하려면 매번 `#/`(목록) 화면으로 돌아가야 해서, 여러 개념을 넘나들며 확인할 때 불편하다.

목록 화면(`viewIndex`)에는 이미 그룹별 개념 목록 + 기능 목록 렌더 로직이 있으므로, 이를 상세 화면 좌측 사이드바로 재사용해 열고 닫을 수 있게 한다.

## 목표 / 비목표

목표:
- 개념 상세(읽기/편집)·기능 상세 화면에 좌측 사이드바(그룹별 개념 목록 + 기능 목록)를 추가하고, 열고 닫는 토글을 제공한다.
- `≥1280px`: 기본 열림. `<1280px`: 기본 닫힘(오버레이 드로어).
- 사용자가 마지막으로 선택한 열림/닫힘 상태를 `localStorage`에 기억해 다음 방문에 우선 적용한다(창 크기 변경만으로는 덮어쓰지 않음).
- 현재 보고 있는 항목을 사이드바에서 강조(active) 표시한다.

비목표:
- 목록 화면(`#/`)·그래프 화면(`#/graph`) 레이아웃 변경 — 그대로 유지.
- 사이드바 내 검색/필터 입력 — 목록 화면에 이미 검색이 있으므로 중복 구현하지 않는다.
- 사이드바 폭 리사이즈, 다단 접기 등 추가 UX — YAGNI.

## 아키텍처 / 구성 요소

**1. 신규 에셋 `assets/sidebar.js` (전역 스크립트, `CPSidebar` 네임스페이스)**

`viewer.js`(1697줄)에 더 보태지 않고 별도 파일로 분리한다. 모듈이 아닌 전역 스크립트로, `viewer.js`가 이미 로드한 `h()` / `state` / `displayName` / `conceptEntry` 등을 그대로 사용한다(로드 순서: `sidebar.js` → `viewer.js`, `sidebar.js`는 함수 선언만 하고 즉시 DOM을 만들지 않으므로 순서 문제 없음).

공개 API:
```js
CPSidebar.isOpen()        // localStorage 있으면 그 값('1'/'0'), 없으면 innerWidth >= 1280
CPSidebar.setOpen(bool)   // localStorage('cp.sidebar.open') 저장 + 현재 shell DOM에 클래스 반영
CPSidebar.shell(activeKind, activeSlug, wrapNode)
  // activeKind: 'concept' | 'feature', activeSlug: 문자열
  // wrapNode: 기존에 만들던 `.wrap` div (본문)
  // 반환: 사이드바 + 토글 버튼 + backdrop + wrapNode를 담은 최상위 노드
```

**2. DOM 구조**

```html
<div class="shell {open? 'shell--open' : ''}">
  <button class="side-toggle" aria-expanded="..." aria-controls="cp-side">☰</button>
  <aside id="cp-side" class="side">
    <div class="side__head">
      <strong>개념 목록</strong>
      <button class="side-close">✕</button>
    </div>
    <!-- 그룹별 개념 목록 + 기능 목록, viewIndex와 동일한 groupedConcepts() 재사용 -->
  </aside>
  <div class="side-backdrop"></div>
  <!-- wrapNode 그대로 삽입 -->
</div>
```

- `side-toggle` 클릭 → `setOpen(!isOpen())`
- `side-close` / `side-backdrop` 클릭 / `Esc` 키 → `setOpen(false)` (닫기는 항상 가능; backdrop·Esc는 좁은 화면 오버레이 모드에서만 의미 있지만 핸들러는 공통으로 둔다)

**3. CSS (`assets/concept.css`에 추가)**

- `≥1280px`: `.shell`이 flex-row. `.side`는 sticky, 폭 280px, 자체 세로 스크롤. `.side-backdrop` 항상 `display:none`. `shell--open` 없어도(즉 닫힘 상태여도) 이 폭에서는 강제로 보이게 하지 않고 CSS는 JS가 준 클래스를 그대로 따른다 — 단, 최초 렌더 시 `isOpen()` 계산값이 이미 1280 이상에서 true이므로 실질적으로 항상 열려 보인다. `.shell:not(.shell--open) .side`는 `display:none`(좁은 화면과 동일 처리, 넓은 화면에서도 사용자가 닫으면 실제로 숨어야 하므로).
- `<1280px`: `.side`가 `position:fixed; inset:0 auto 0 0; width:min(320px,86vw); transform:translateX(-100%); transition`. `.shell--open .side`는 `translateX(0)`. `.shell--open .side-backdrop`는 `display:block`(반투명 배경, 클릭 시 닫힘).
- `.side-toggle`은 항상 보이는 작은 버튼(breadcrumbs 옆).

**4. `viewer.js` 변경**

- `viewIndex`의 그룹핑 로직(그룹별 `<section>` + 기능 섹션)을 `groupedConceptList(activeSlug)` / `featureListSection(activeSlug)` 헬퍼로 추출 — `viewIndex`와 `sidebar.js`(또는 `viewer.js` 내 `CPSidebar.shell`)가 공유. 이 추출 함수는 각 항목에 `slug === activeSlug`일 때 `--active` 클래스와 `aria-current="page"`를 추가로 붙인다.
- `renderConceptRead`, `renderConceptEdit`, `viewFeature` 세 곳에서 `setApp(h('div', {class:'wrap'}, sections))` 대신 `setApp(CPSidebar.shell('concept'|'feature', slug, h('div', {class:'wrap'}, sections)))`로 교체.
- 목록 화면(`viewIndex`)·그래프 화면(`viewGraph`)은 변경하지 않는다.

**5. 상태 기억 규칙**

- `localStorage['cp.sidebar.open']`: 없음 → `innerWidth >= 1280` 기본값. `'1'`/`'0'` 있으면 그 값 우선.
- `setOpen(bool)`이 호출될 때만(= 사용자가 토글 버튼/닫기/backdrop/Esc로 명시적으로 조작할 때만) `localStorage`에 씀. 창 리사이즈 이벤트로는 값을 바꾸지 않는다(요구사항).

**6. i18n (`viewer.js`의 `I18N.ko`/`I18N.en`)**

- `showSidebar`/`hideSidebar`(토글 버튼 aria-label), `sidebarTitle`('개념 목록' 재사용 가능하면 기존 `conceptList` 키 재사용).

**7. 배포 배관**

- `assets/index.html`에 `<script src="assets/sidebar.js"></script>`를 `viewer.js`보다 먼저 추가.
- `src/viewer/render.ts`의 `renderViewerToDisk`에 `copyAsset('sidebar.js', join(p.conceptsViewer, 'assets', 'sidebar.js'))` 추가.
- `pnpm build` 후 `node dist/cli.js render` (또는 프로젝트의 sync 절차)로 `docs/conceptpowers/concepts/viewer/`까지 갱신 — 단, baseline 자체(concepts/*.json)는 건드리지 않는다. `assets/viewer.js`·`assets/sidebar.js`·`assets/concept.css`·`assets/index.html`은 `@concept:none`(거버넌스 밖 뷰어 UI)이므로 별도 개념 정의 없이 진행.

## 데이터 흐름

```
renderConceptRead(slug)
  └─ sections = [...기존 렌더...]
  └─ wrapNode = h('div', {class:'wrap'}, sections)
  └─ setApp(CPSidebar.shell('concept', slug, wrapNode))
       └─ CPSidebar.isOpen() → shell--open 클래스 여부 결정
       └─ groupedConceptList(slug) / featureListSection(slug) → 사이드바 내용
       └─ 토글 버튼/backdrop/Esc 핸들러 부착 → CPSidebar.setOpen()
            └─ localStorage 갱신 + DOM 클래스 갱신 (재렌더 없이 즉시 반영)
```

## 테스트 계획

DOM 렌더링 자체를 검증하는 jsdom 계열 설정이 프로젝트에 없으므로(현재 vitest는 node 환경), 다음을 우선 적용:

1. **`tests/viewer/renderDisk.test.ts`**: `assets/sidebar.js`가 `docs/conceptpowers/concepts/viewer/assets/sidebar.js`로 복사되는지, `index.html`이 `assets/sidebar.js`를 참조하는지 assert 추가.
2. **신규 `tests/viewer/sidebarState.test.ts`**: `assets/sidebar.js`를 `node:vm`으로 로드하되 `window`/`localStorage`/`document`를 최소 스텁으로 주입해 순수 상태 로직만 검증:
   - localStorage 비어있고 `innerWidth=1280` → `isOpen() === true`
   - `innerWidth=1279` → `isOpen() === false`
   - localStorage에 `'0'` 저장돼 있으면 `innerWidth`와 무관하게 `isOpen() === false`
   - `setOpen(true)` 호출 후 localStorage에 `'1'`이 쓰였는지
3. 수동 브라우저 확인: `pnpm build` → 뷰어 서버 실행 → 1280px 이상/미만 각각에서 기본 열림/닫힘, 토글 동작, 새로고침 시 기억된 상태 유지 확인.

## 리스크 / 트레이드오프

- 그룹핑 로직을 헬�퍼로 추출하면서 `viewIndex`의 기존 동작(검색창, 스크롤 앵커 `#g-<group>`)을 건드리지 않도록 주의해야 함 — 추출 함수는 순수하게 목록 노드만 만들고, 검색/스크롤은 `viewIndex`에 그대로 남긴다.
- `sidebar.js`가 `viewer.js`의 전역 함수(`h`, `state`, `displayName` 등)에 의존하므로 로드 순서가 깨지면(예: 번들러 도입 시) 조용히 실패할 수 있음 — 현재는 두 파일 다 plain `<script>` 태그라 순서만 지키면 안전.
