---
name: review
description: Use BEFORE writing/modifying code (including tests) that adds a feature or changes behavior in a governance-active project, and whenever the user asks to check that code follows its concepts ("검토", "이 개념대로 구현됐나", "전체 검토"). Judges code against the allow/restrict/immutable rules of the concepts mapped to it — one procedure, three entry modes: pre-change check (files → concepts), one concept (concept → its mapped files), or the whole project.
---

# Conceptpowers: Review (검토 — 코드 ↔ 개념)

> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.

매핑된 코드가 개념의 규칙(`actions.allow` / `actions.restrict` / `principle.immutableRules`)대로 구현됐는지
판정한다. **판정 절차는 하나**이고 들어오는 문이 셋이다.

| 모드 | 시작점 | 누가 부르나 |
| --- | --- | --- |
| ① **변경 전 검사** | 바꾸려는 파일(들) | Edit/Write 훅 안내, 코드 작업 중 자동 |
| ② **특정 개념** | 개념 slug 하나 → 그 개념에 매핑된 파일 전부 | 사용자 |
| ③ **전체** | 모든 green 개념 → 각각 ② | 사용자, `auto` |

사용자가 모드를 말하지 않고 불렀으면 **②/③ 중 무엇을 원하는지 묻는다**.

## Scope (①)

- **In scope**: 기능 추가, 기존 동작 변경, 관련 테스트 작성.
- **Out of scope**: 단순 리팩터링, 오타, 포맷팅.

## Judgment basis: concepts ONLY (do not read reference/)

**정의된 개념이 사실이다** — 여기서는 `docs/conceptpowers/reference/`를 절대 읽지 않는다. 판단하기에 개념이
너무 모호하면 그것은 **개념의 결함**이다 → 아래 판정 ③.

**Read narrow, not wide.** ①은 거의 모든 코드 변경마다 돌므로 비용이 프로젝트 크기와 무관하게 일정해야 한다:
태그 → 인덱스 → 개념 파일 1~3개. `concepts/data/`를 통째로 읽지 않는다.

## Locating concepts and files

### ① 파일 → 개념
1. **태그(무료)** — 대상 파일 첫머리 주석 블록(첫 코드 줄 앞)의 `@concept:<slug>`를 읽는다. `'use client';`,
   docstring, `<template>`이 먼저 오면 엔진이 태그를 못 본다. 태그가 있으면 그것이 답이다.
2. **인덱스(작은 파일 하나)** — 태그가 없으면 `docs/conceptpowers/concepts/viewer/manifest.json`을 **한 번** 읽는다.
   `concepts[]`의 `slug / title / group / codeLinks`로 이 파일을 다스리는 개념을 거꾸로 찾고 title/category로 좁힌다.
   manifest가 없거나 낡았으면 `docs/conceptpowers/.cache/mapping.json`(slug → files).
3. **대상 읽기** — 인덱스가 낸 후보 개념 파일 1~3개만 연다(`concepts/data/<group>/<slug>.json`).
4. **최후 수단** — 후보가 없을 때만 `concepts/data/`를 키워드로 grep. 그래도 없으면 "관련 개념 없음" →
   `conceptpowers:update-concepts`로 먼저 정의한다. 판정 뒤 태그 없던 파일에 개념이 맞았으면 `@concept` 태그를
   달고 `map`으로 매핑을 갱신한다(다음부터는 1번으로 끝난다).

### ② 개념 → 파일
- `docs/conceptpowers/.cache/mapping.json`의 `slug → files` + 그 개념을 가리키는 feature의 `codePaths`
  (`docs/conceptpowers/features/**`). 디스크에 없는 경로는 건너뛴다.
- 파일이 많으면 규칙과 맞닿는 파일부터(허용·제한 행동이 바꾸는 관리 대상을 다루는 파일) 보고, 나머지는
  표본 검사한다고 사용자에게 밝힌다.

### ③ 전체
- `node "<cli>" audit --root .`로 매핑 무결성(`unknownTags`)을 먼저 확인하고, green 개념마다 ②를 돈다.
  red/pending 개념은 코드를 다스리지 않으므로 판정 대상이 아니다(목록만 보고).

## Judgment (모든 모드 공통)

개념의 **actions.allow / actions.restrict / principle.immutableRules**를 읽고 파일(또는 계획한 변경)마다 셋 중
하나로 판정한다:

- **① 위반 없음** → 진행. 코드를 바꿀 때는 `@concept` 태그·매핑도 함께 갱신한다(`map`).
- **② 위반** → **코드를 임의로 고치지 않는다.** 사용자에게 보고하고 고르게 한다:
  (a) **개념 수정** — 사용자가 정확한 변경을 승인할 때만 `conceptpowers:update-concepts`(C 흐름, `edit-concept`).
  green이 pending으로 내려가 정합성 검사와 사용자 확인 뒤에야 다시 코드를 다스린다.
  (b) **기능/개념 분리** — 새 기능 명세나 개념으로 나눈다. 코드를 통과시키려고 개념을 조용히 고치지 않는다.
- **③ 판단 불가(개념 모호)** — 규칙만으로 "이 코드가 어기는가"에 답할 수 없다 → 추측하지 않고 reference도
  읽지 않는다. "개념 `<slug>`의 규칙만으로는 판단할 수 없습니다"라고 어느 규칙·어떤 해석 차이인지 밝히고
  `conceptpowers:update-concepts`의 업그레이드 진입점(reference는 **거기서** 읽는다, `note-change` 기록)을
  권한다. 지금 올릴지는 사용자가 정한다.

테스트가 개념과 충돌하면 조용히 통과시키지 않는다 — 테스트 오류인지 개념이 낡았는지 사용자에게 묻는다.

## Report (②/③)

개념별로: 검사한 파일 수 / 위반 목록(파일·규칙·근거) / 판단 불가 목록(어느 규칙이 모호한지) / 표본 검사로
넘긴 파일. 권장 조치는 위 판정표의 (a)/(b)/업그레이드 가운데 하나로 적는다. 기준선은 읽기 전용이므로 개념
생성·수정은 사용자 확인 뒤 `update-concepts`에서만 한다.

## Test scenarios from concepts (conceptDrivenTests)

변경의 목적이 **테스트** 작성·수정이고 `init.json`의 `conceptDrivenTests`가 켜져 있으면(없으면 켜짐, `false`만 끔):

- 위반 판정에서 멈추지 말고 찾은 개념의 규칙을 시나리오 목록으로 바꾼다: `actions.allow` / `actions.restrict` /
  `principle.immutableRules` 항목마다 가능한 한 시나리오 하나 이상, 각 시나리오는 어느 규칙을 확인하는지 밝힌다.
- 개념 찾기는 위 ① 절차 그대로 — 추가 스캔 없음.
- **모든 테스트 파일은 개념을 가리킨다.** 첫머리 주석 블록에 `@concept:<slug>`. 예약어 `@concept:none`은 일반
  코드에는 허용되지만 테스트에는 **불가**(커밋 게이트 `concept-test-scope`).
- **개념 안에 머문다.** 시나리오마다 `allow / restrict / immutableRules`의 규칙 하나로 거슬러 올라가야 한다.
  개념이 말하지 않는 동작을 단언하면 소유자 없는 둘째 계약이 생긴다. 필요한 검사가 개념 밖이면 멈추고 개념을
  먼저 넓혀야 한다고 사용자에게 말한다(`update-concepts`) — 테스트를 넓히지 않는다. 반대로 코드를 통과시키려고
  테스트를 약화·삭제하지도 않는다.
- `conceptDrivenTests`가 명시적으로 `false`면 이 절은 건너뛴다.

### When the concept itself changed (test-follow duty)

개념 수정은 그 개념에서 파생된 모든 테스트를 의심하게 한다. 개념 변경과 **같은 커밋**에서:

1. 그 개념의 테스트를 찾는다(매핑 캐시 / `@concept` 태그 → 테스트 파일).
2. **새** 규칙에서 시나리오 목록을 다시 뽑아 현재 테스트가 단언하는 것과 견준다. 바뀌거나 사라지거나 새로 생긴
   규칙마다 고치거나 지우거나 더할 테스트가 하나씩 대응된다.
3. 고친 테스트를 개념 변경과 함께 스테이징한다.
4. 정말 고칠 것이 없거나(문구만 바뀜) 테스트가 아직 없으면 사용자 확인 후 사유를 기록한다:
   `node "<cli>" attest-test-review <slug> --result updated|no-impact|no-tests --tests <paths> --note "<why>" --root .`
   기록은 개념 지문에 묶여 개념을 다시 고치면 효력을 잃는다.

커밋 게이트 `concept-test-follow`가 정확히 이것을 강제한다: 테스트도 기록도 없는 어긋난 개념은 `strict`에서
차단, `standard`에서 질문, `light`에서 경고.

## Prohibited

- 변경을 정당화하려고 **스스로 판단해** 개념을 고치는 것. 개념 수정은 사용자가 정확한 변경을 승인할 때만이며
  결과는 `pending`(재승인 필요) — 조용한 green 편집은 없다.
- 판정에 reference를 읽는 것.
