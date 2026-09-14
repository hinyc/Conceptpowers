---
name: scan
description: Use when the user wants to find what is NOT yet covered by concepts in a governance-active project ("상태 탐색", "개념 전수 점검", "audit", "감사", "개념 없는 코드 찾기", "구멍 찾기", "기능 명세", "feature spec", "매핑 갱신", "태그 달기") and after modifying, moving, or deleting code to resync @concept tags — concept-less code, broken @concept links, features missing a spec, unapproved red / lingering pending concepts — and to wire @concept tags and the mapping cache. Finds gaps; it does not judge code against rules (that is review).
---

# Conceptpowers: Scan (상태 탐색 — 개념이 안 걸린 것 찾기)

> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.

프로젝트에서 **개념이 걸리지 않은 것**을 찾아 목록으로 만들고, 사용자와 함께 처리한다. 코드가 개념대로인지
판정하지는 않는다 — 그것은 `conceptpowers:review`다. 개념을 새로 쓰는 일도 하지 않는다 — 필요하면
`conceptpowers:update-concepts`로 넘긴다.

> **Concepts ONLY**: 여기서는 `reference/` 내용을 읽지 않는다. 허용되는 것은 비어 있는지 확인(폴더 목록 +
> `paths.md` 항목 유무)뿐이다.

> **코드 수정 뒤 매핑만 갱신할 때**(파일 몇 개의 태그·캐시, 파일 이동·삭제 뒤): 아래 Steps를 건너뛰고
> 「태그 규칙과 매핑 갱신」만 실행한다. 전체 점검은 사용자가 "상태 탐색 / 구멍 찾기 / 전수 점검"을 요청했을 때.

## Steps

1. **무결성 + 격차 (결정적)**: 파일 인자 **없이** CLI 감사를 돌린다 — 전체 스캔 모드다. `git ls-files`를 걷고
   (`ignoreGlobs` 적용) `{...report, conceptless: [...]}`를 낸다. `unknownTags`나 `conceptless`가 있으면 exit 1
   인데 이는 진단 데이터이지 실패가 아니다.
   `node "<cli>" audit --root .`
   - `unknownTags`: 없는 개념을 가리키는 태그.
   - `conceptless`: `@concept` 마커가 전혀 없는 파일 — 2번 격차 판단의 결정적 출발점이다.
   - `unapproved`: 🔴 red 개념 전부, `unapprovedRefs`: 스캔한 파일이 가리키는 red.
   - (파일 인자를 주면 태그 정합성만 검사하고 격차 탐지는 건너뛴다 — 전체 점검엔 인자 없이.)
2. **격차 처리 (의미 판단)**: `conceptless` 목록의 파일마다 무엇이 필요한지 가린다. 개념이 필요한 기능·동작·역할·
   권한·용어인데 태그가 없는 것을 찾는다.
   - **기존 개념이 이미 있음** → 태그를 제안한다(아래 태그 규칙).
   - **개념이 없음** → `conceptpowers:update-concepts`(B, 새 개념 정의)로 넘긴다. 넘기기 전에 reference가
     비어 있는지 확인(존재 확인만)하고, 비었으면 "reference/가 비어 있습니다 — 이 상태로 개념을 정의하면 근거
     자료 없이 작성됩니다"라고 알린 뒤 ① 그대로 진행 ② 파일 추가 ③ 바깥 경로 등록(`update-concepts` E)을 묻는다.
   - **개념과 무관한 코드**(utils/types/config/scripts) → 명시적 **`@concept:none`**(침묵이 아니라).
   - 커밋 게이트도 마커 없는 코드를 잡는다(`[WARNING] 개념 없는 코드`). `@concept:none`은 마커로 친다.
     `init.json`의 `ignoreGlobs`(`dist/**`, `**/*.generated.*` …)에 맞는 재생성물·외부 코드만 예외다.
3. **기능 커버리지 (지식 지도)**: 사용자 접점(버튼·폼 제출·메뉴·라우트·명령)마다 `features/`에 기능 명세가 있고
   `concepts`(기능 → 개념)와 `codePaths`(기능 → 코드)가 채워졌는지 본다. 없거나 비었으면 아래 **기능 명세
   기록** 절차로 만든다. 이것이 `#/graph`를 연결된 상태로 유지한다.
4. **red / pending (상태)**:
   - 🔴 red(자동 추론, 미승인) → 목록을 보이고 사용자가 검토·승인을 원하면 `conceptpowers:update-concepts`(D)로.
     **scan이 스스로 승인하지 않는다.**
   - 🟡 pending(사람이 쓴 초안, 미정착) → 목록을 보이고 `update-concepts`의 정합성 검사 재실행을 권한다.
     pending을 "미승인"이라 부르지 않는다 — 초안이지 추론이 아니다.
5. **green 품질 최소치**: `node "<cli>" quality --root .`(slug 없이 전수). 결격이 있으면 보고하고 사용자와 함께
   채우자고 권한다(자동 채움 금지, 강등도 사람 판단).
6. **태그 달기 + 매핑 갱신** (아래 규칙), 그리고 `node "<cli>" render --root .`.
7. **보고**: 격차 / 깨진 태그 / 기능 명세 누락 / red / pending / 품질 결격 + 각각 권장 조치. 기준선은 읽기
   전용이므로 개념 생성·수정은 사용자 확인 뒤 `update-concepts`에서만 한다. 코드가 개념대로인지는 여기서
   판정하지 않았다 — 전수 판정을 원하면 `conceptpowers:review` 전체 모드로 이어간다.

## 태그 규칙과 매핑 갱신

1. **다스려지는 코드 파일은 모두 첫머리에 명시적 `@concept` 마커를 가진다** — 조용한 공백은 없다.
   - 개념이 있으면 **첫머리 주석 블록 안, 첫 코드 줄 앞**에 `@concept:<slug>`. 엔진은 그 블록만 훑는다 —
     `'use client';`, docstring, `<template>`이 먼저 오면 마커가 보이지 않는다. slug는 개념 slug와 정확히
     같아야 한다. 한 파일이 여러 개념에 걸치면 태그를 여럿 단다(개념 `concept-code-binding`의 분리 검토 뒤).
   - 개념이 없으면 같은 자리에 **`@concept:none`**. 예약어라 게이트는 통과하지만 개념으로 취급되지 않는다.
   - `ignoreGlobs`는 재생성물·외부 코드만 자동 제외한다. 손으로 쓴 코드는 예외 없이 마커가 필요하다.
     `ignoreGlobs`에 경로를 더하는 것은 진짜 생성물일 때만 — 감사를 피하려고 넓히지 않는다.
2. 매핑 캐시 갱신:
   `node "<cli>" map --root . <changed files...>`
   - 기본은 증분: 넘긴 파일의 항목만 바꾸고 나머지는 보존한다. **삭제한 파일도 인자에 넣어야** 낡은 항목이 빠진다.
   - 처음부터 다시 만들려면(캐시 손상 복구) `--full`: `node "<cli>" map --full --root . <all source files...>`.
   - 이어서 `node "<cli>" render --root .`.
3. 태그가 없는 개념을 가리키면(`unknownTags`) 개념을 정의하거나(`update-concepts`) 태그를 고친다.
4. 파일을 옮기거나 지울 때는 **같은 커밋**에서 태그를 옮기고 매핑을 갱신한다.
5. `mapping.json`은 **캐시**이지 기준선이 아니다. 진실은 코드의 `@concept` 태그다.

## 기능 명세 기록 (feature → concept, feature → code)

> reference를 읽지 않는다 — 기능 명세는 지도 배선이지 계약 작성이 아니다. 기능 명세는 기능→개념·기능→코드
> 링크의 **유일한 출처**다(엔진은 검증·기록만). 내용은 `init.json`의 `locale`로 쓴다.

1. **기능 식별** — 구체적 사용자 접점 하나: 버튼, 폼 제출, 메뉴 동작, 라우트, 명령. 짧은 `title`과 한 줄 `description`.
2. **기능 → 코드**(`codePaths`): 구현 파일 목록.
3. **기능 → 개념**(`concepts`): 이 기능이 실현하는 개념 slug. 없으면 `update-concepts`로 먼저 정의하고 돌아온다.
4. slug(kebab-case, 유일)와 `group`(선택) 결정.
5. 엔진으로 검증·기록(스키마 검사, 중복 slug 거부):
   `node "<cli>" feature --root . --file <feature.json>`
   JSON: `{ slug, group?, title, description?, concepts[], codePaths[] }` → `docs/conceptpowers/features/[group/]<slug>.json`.
6. 같은 파일들에 `@concept:<slug>` 태그가 있는지 확인하고 `map`으로 갱신 — 개념과 기능이 같은 파일 노드에서 만난다.
7. `render`. `concepts`의 slug는 정확해야 한다 — 없는 개념으로의 간선은 조용히 버려진다.

## Backfill modes

- incremental: 격차만 보고하고 점진적 보충을 권한다 — 기능 명세와 링크 누락 포함.
- strict: 모든 격차를 즉시 해소하도록 밀어붙인다(init strict 또는 사용자 요청).

## Viewer handoff (마지막 단계 — 생략 금지)

After `render`, always end with a clickable viewer link (render prints the path + serve command).
Reuse the running server's URL if one is up — deep-link `#/concept/<slug>` / `#/group/__features/<slug>` / `#/architecture` —
otherwise start `concepts:view` in the background (fallback: `node docs/conceptpowers/concepts/viewer/serve.mjs`) and print its URL.
