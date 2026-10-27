---
name: review
description: Use BEFORE writing/modifying code (including tests) that adds a feature or changes behavior in a governance-active project, and whenever the user asks to check that code follows its concepts ("검토", "이 개념대로 구현됐나", "전체 검토"). Judges code against the allow/restrict/immutable rules of the concepts mapped to it — one procedure with three entry modes (pre-change check, one concept, whole project). Never reads reference.
---

# Conceptpowers: Review (검토 — 코드 ↔ 개념)

> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.

매핑된 코드가 개념의 규칙(`actions.allow` / `actions.restrict` / `principle.immutableRules`)대로 구현됐는지
판정한다. **판정 절차는 하나**이고 들어오는 문이 셋이다.

| 모드               | 시작점                                      | 누가 부르나                                     |
| ------------------ | ------------------------------------------- | ----------------------------------------------- |
| ① **변경 전 검사** | 바꾸려는 파일(들)                           | Edit/Write 훅이 안내, 에이전트가 코드 작업 전에 |
| ② **특정 개념**    | 개념 slug 하나 → 그 개념에 매핑된 파일 전부 | 사용자                                          |
| ③ **전체**         | 모든 green 개념 → 각각 ②                    | 사용자, `auto`                                  |

에이전트가 코드 작업 전에 스스로(또는 Edit/Write 훅 안내로) 부른 것이면 **①**이다 — 묻지 않는다. 사용자가 모드를
말하지 않고 불렀을 때만 **②/③ 중 무엇을 원하는지 묻는다**.

## Scope (①)

- **In scope**: 기능 추가, 기존 동작 변경, 관련 테스트 작성.
- **Out of scope**: 단순 리팩터링, 오타, 포맷팅.

## Judgment basis: concepts ONLY (do not read reference/)

**판정 기준은 정의된 개념뿐이다** — 여기서는 `docs/conceptpowers/reference/`를 절대 읽지 않는다. 판단하기에 개념이
너무 모호하면 그것은 **개념의 결함**이다 → 아래 판정 ③.

**규칙은 요구이지 현재 사실이 아니다.** green 개념은 "이렇게 되어야 한다"를 말할 뿐, 지금 코드가 그렇다는 뜻이
아니다. 사용자에게 시스템이 어떻게 동작하는지 말할 때는 코드로 확인하고, 코드와 개념이 다르면 규칙을 사실처럼
전하지 말고 위반 후보로 보고한다(판정 ②).

**개념 먼저인지 코드 먼저인지 가른다.** 의도·여러 곳에 흩어진 규칙·"이게 허용되나/왜 이렇게 됐나"는 개념에서
시작한다. 값 하나·파일 하나의 구현 세부·화면 세부·"어디서 구현했나"는 코드로 바로 간다 — 개념은 어디에·어떻게
구현했는지 말하지 않고, 어느 개념도 다루지 않는 영역은 코드가 답이다.

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
   `conceptpowers:update-concepts`(계기 B)로 먼저 정의한다. 판정 뒤 태그 없던 파일에 개념이 맞았으면 `@concept` 태그를
   달고 `map`으로 매핑을 갱신한다(다음부터는 1번으로 끝난다).

### ② 개념 → 파일 · ③ 전체

대상 파일을 모으는 방법과 보고 형식은 `references/whole.md`에 있다 — ②/③으로 왔을 때만 읽는다.

## Judgment (모든 모드 공통)

개념의 **actions.allow / actions.restrict / principle.immutableRules**를 읽고 파일(또는 계획한 변경)마다 셋 중
하나로 판정한다:

- **① 위반 없음** → 진행. 코드를 바꿀 때는 `@concept` 태그·매핑도 함께 갱신한다(`map`).
- **② 위반** → **코드를 임의로 고치지 않는다.** 사용자에게 보고하고 고르게 한다:
  (a) **개념 수정** — 사용자가 정확한 변경을 승인할 때만 `conceptpowers:update-concepts`(C 흐름, `edit-concept`).
  green이 pending으로 내려가 정합성 검사와 사용자 확인 뒤에야 다시 코드를 다스린다.
  (b) **기능/개념 분리** — 새 기능 명세(`conceptpowers:scan`의 기능 명세 기록)나 개념(`update-concepts` 계기 B, 기존 개념을 좁히면 계기 C)으로 나눈다. 코드를 통과시키려고 개념을 조용히 고치지 않는다.
- **③ 판단 불가(개념 모호)** — 규칙만으로 "이 코드가 어기는가"에 답할 수 없다 → 추측하지 않고 reference도
  읽지 않는다. "개념 `<slug>`의 규칙만으로는 판단할 수 없습니다"라고 어느 규칙·어떤 해석 차이인지 밝히고
  `conceptpowers:update-concepts` **계기 F(개념 업그레이드)** — reference는 **거기서** 읽고 변경은 `edit-concept --reason`으로
  기록된다 — 를 권한다. 지금 올릴지는 사용자가 정한다.

테스트가 개념과 충돌하면 조용히 통과시키지 않는다 — 테스트 오류인지 개념이 낡았는지 사용자에게 묻는다.

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

개념을 고칠 때 그 개념에서 파생된 테스트를 같은 커밋에서 검토하는 의무(커밋 게이트 `concept-test-follow`)는
`conceptpowers:update-concepts`의 개념 수정 절차(계기 C)가 정한다 — 개념 수정은 그 스킬에서만 일어나기 때문이다.

## Prohibited

- 변경을 정당화하려고 **스스로 판단해** 개념을 고치는 것. 개념 수정은 사용자가 정확한 변경을 승인할 때만이며
  결과는 `pending`(정합성 검사 증빙과 사용자 확인 뒤 재정착) — 조용한 green 편집은 없다.
- 판정에 reference를 읽는 것.
