# 뷰어 사이드바 상단 검색창 — 설계

날짜: 2026-07-29
상태: 승인됨 (구현 대기)

## 배경 / 문제

상세 화면(`assets/sidebar.js`의 `CPSidebar.shell()`)에는 개념/기능 그룹별 목록이 있지만, 목록이 길어지면 원하는 항목을 찾기까지 스크롤이 필요하다. 목록 화면(`viewIndex`)에는 이미 전체 검색(`searchData`/`renderSearchResults`, 개념·기능·파일 경로 대상)이 있지만, 상세 화면 사이드바에는 검색이 없다.

참고: 직전 사이드바 설계([[2026-07-27-viewer-concept-sidebar-design]])에서는 "사이드바 내 검색/필터 입력"을 비목표로 명시했었다(목록 화면 검색과 중복 방지). 이번 요청은 그 결정을 사용자가 명시적으로 뒤집는 후속 기능이다 — 전체 검색 재사용이 아니라, 사이드바 자체 목록만 걸러내는 축소된 범위로 진행한다.

## 목표 / 비목표

목표:
- 사이드바(`side__head` 아래, `side__list` 위)에 검색 입력창을 추가한다.
- 입력한 검색어로 이미 렌더된 사이드바의 개념/기능 항목(`li`)을 텍스트 기준(제목+분류, 대소문자 무시, 부분일치)으로 즉시 필터링한다.
- 그룹의 모든 항목이 필터로 숨겨지면 그룹 헤더(`h2`)까지 함께 숨긴다.
- 아무 그룹도 남지 않으면 기존 `t.noResults` 문구를 보여준다.

비목표:
- 목록 화면의 전체 검색(`searchData`, 파일 경로/@concept 색인 결과 포함)을 사이드바에 재사용하지 않는다 — 사이드바는 이미 표시된 개념·기능 목록만 대상으로 한다.
- 검색어를 `localStorage` 등으로 페이지 전환 간 기억하지 않는다 — `shell()`이 매 네비게이션마다 새로 렌더되므로 자연히 초기화된다.
- 사이드바 열림/닫힘 상태 로직([[2026-07-27-viewer-concept-sidebar-design]])은 변경하지 않는다.

## 아키텍처 / 구성 요소

**1. `assets/sidebar.js` — `shell()` 변경**

- `side__head`와 `sidebarListNode(...)` 사이에 검색 입력 행을 추가:
  ```html
  <div class="side__search">
    <input type="search" class="side-search" placeholder="{t.sidebarSearchPh}">
  </div>
  ```
- `input` 이벤트 핸들러: 매 키 입력마다
  1. `aside.querySelectorAll('.side__list .group')`를 순회.
  2. 각 그룹 내 `li`의 `textContent`(소문자, trim)에 검색어(소문자, trim)가 포함되는지 검사해 `li.style.display`를 토글.
  3. 그룹 내 보이는 `li`가 0개면 그룹(`section.group`) 전체를 숨기고, 1개 이상이면 보여준다.
  4. 검색어가 빈 문자열이면 모든 `li`/그룹을 다시 보이게 한다.
  5. 보이는 그룹이 0개면 미리 만들어둔 `noResultsNode`(`t.noResults`, 기본 숨김)를 보여주고, 아니면 숨긴다.
- 매칭 판정은 순수 함수 `matchesQuery(text, q)`로 분리해 테스트 가능하게 한다.

**2. i18n (`viewer.js`의 `I18N.ko`/`I18N.en`)**

- 신규 키 `sidebarSearchPh`: ko `"개념 · 기능 검색"`, en `"Search concepts · features"`.
- 기존 `t.noResults`("검색 결과가 없습니다." / "No results.")를 그대로 재사용.

**3. CSS (`assets/concept.css`)**

- `.side-search` 규칙 추가: 기존 `.search-in`과 톤(색/보더/포커스)은 맞추되 `max-width: 100%`, 사이드바 패널 폭(260px)에 맞는 여백으로 좁힌 버전.
- `.side__search` 래퍼: `side__head`와 `side__list` 사이 여백만 담당.

**4. 배포 배관**

- `assets/sidebar.js`·`assets/concept.css`·`assets/viewer.js`(i18n 키 추가)만 수정하면 되고, 새 에셋 파일 추가는 없다 — `src/viewer/render.ts`의 `copyAsset` 목록 변경 불필요.
- 세 파일 모두 `@concept:none`(거버넌스 밖 뷰어 UI)이므로 개념 정의/승인 절차 없이 진행.
- `pnpm build` 후 `node dist/cli.js render`(또는 프로젝트 sync 절차)로 `docs/conceptpowers/concepts/viewer/`까지 갱신.

## 데이터 흐름

```
CPSidebar.shell(activeKind, activeSlug, wrapNode)
  └─ sidebarListNode(...) → .side__list DOM 생성 (그룹별 개념 li + 기능 li)
  └─ searchIn = <input class="side-search">
       └─ 'input' 이벤트 → filterSideList(query)
            └─ .side__list 안의 각 .group을 순회
                 └─ 각 li: matchesQuery(li.textContent, query) → display 토글
                 └─ 그룹: 보이는 li 존재 여부 → section display 토글
            └─ 보이는 그룹 0개 → noResultsNode 표시
```

## 테스트 계획

DOM 렌더링(표시/숨김) 자체를 검증하는 jsdom 계열 설정이 프로젝트에 없으므로(vitest는 node 환경):

1. **`matchesQuery(text, q)` 단위 테스트** — `tests/viewer/sidebarState.test.ts`에 케이스 추가(또는 같은 패턴의 신규 `describe` 블록): 대소문자 무시, 부분일치, trim, 빈 문자열이면 항상 true.
2. 수동 브라우저 확인(`pnpm build` → `pnpm concepts:view`): 개념/기능 여러 건이 있는 화면에서
   - 검색어 입력 시 매칭 안 되는 항목/그룹이 숨겨지는지
   - 검색어를 지우면 전부 복원되는지
   - 매칭 0건일 때 "검색 결과가 없습니다" 문구가 보이는지
   - 다른 개념/기능으로 이동하면 검색어가 초기화되는지

## 리스크 / 트레이드오프

- DOM 텍스트 기반 필터라 `li`에 렌더된 텍스트(제목+분류)만 매칭 대상이다 — slug나 그룹명 자체는 매칭에 포함되지 않는다(범위를 "사이드바에 이미 보이는 것"으로 한정하기로 한 결정에 따른 트레이드오프).
- jsdom이 없어 실제 표시/숨김 렌더링은 자동화 테스트로 못 잡고 수동 확인에 의존한다 — 기존 사이드바 토글 기능과 동일한 제약.
