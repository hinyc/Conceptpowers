---
name: auto
description: Use after init when the user wants guided setup ("auto", "다음 뭐하면 돼?", "알아서 순서대로 진행해줘") in a governance-active project. Diagnoses the current stage and walks baseline → define-concept → audit → update-mapping in the right order, asking at every stage boundary.
---

# Conceptpowers: Auto (단계 안내 오케스트레이터)

> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.

Conceptpowers는 **올바른 순서로 써야** 개념 정의가 제대로 된다 — 기준 문서(baseline, 상위 기준) 없이
개념을 정의하거나, reference 없이 후보를 뽑거나, 감사 없이 매핑하면 결과가 부실해진다.
이 스킬은 그 순서를 대신 기억한다: 현재 단계를 진단하고, **기준 문서(baseline) → define → audit →
mapping** 순서로 기존 스킬을 호출하며, 매 단계 경계에서 사용자에게 진행 여부를 묻는다.

## Role (orchestrator only)

- 이 스킬은 **호출과 안내만** 한다. 기준 문서(baseline)·개념의 내용은 절대 직접 쓰지 않는다 —
  작성은 각 스킬(update-baseline, define-concept) 안에서 사용자와 함께 이뤄진다.
- **매 단계 경계에서 한 번 묻는다**: 무엇을 할지 한두 문장으로 안내 → 실행 → 결과 요약 →
  "다음 단계로 진행할까요? (진행 / 이 단계 건너뛰기 / 여기서 중단)". 확인 없이 두 단계를
  연속 실행하지 않는다.
- 건너뛰기는 항상 허용된다(강제 없음). 건너뛴 단계는 최종 리포트에 남긴다.
- **멱등**: 언제든 재실행 가능. 진단에서 이미 끝난 단계는 "완료됨"으로 보고하고 자동으로
  넘어간다 — 그래서 처음부터든 중도 도입 프로젝트든 같은 방식으로 이어서 쓸 수 있다.

## Stage 0 — Diagnose (읽기 전용, 항상 실행)

무엇도 바꾸지 말고 현재 상태만 수집한다:

1. **기준 문서(baseline)**: `architecture/architecture.md` / `infra/infra.md`가 스캐폴드 템플릿
   그대로인지(주석 한 줄뿐인지) 확인.
2. **reference**: `reference/`가 비었는지 확인 — 파일 없음(스캐폴드 `README.md`뿐)이고 `paths.md`의 외부 경로 항목도 없으면 빈 것으로 본다. **존재 확인만 한다(디렉터리 목록·paths.md 항목 유무) — 내용은 읽지 않는다.** reference 내용은 오직 개념 정의·업그레이드 시점(define-concept/check-consistency)에만 읽는다. 비었으면 Stage 2에서 파일 추가 또는 **외부 로컬 경로 등록(paths.md, 여러 개 가능)**을 제안한다.
3. **개념**: `concepts/data/` 개수와 status 분포(🟢 green / 🟡 pending / 🔴 red).
4. **feature**: `features/` 스펙 개수.
5. **integrity**: `node "<cli>" audit --root .` — **파일 인자 없이** 호출해야 전체 스캔 모드로
   unknownTags와 미태깅 gap(conceptless)이 모두 나온다(파일 인자를 주면 태그 정합성만 검사하고
   gap 탐지는 건너뛴다). gap·오류가 있으면 exit 1을 반환하는데, 이는 진단 데이터이지 실행 실패가 아니다.
   (CLI 경로는 `CONCEPTPOWERS-ACTIVE` 세션 컨텍스트 또는 플러그인 dist.)

결과를 **단계 지도**로 보고한다 — 각 단계가 완료/부분/미시작인지, auto가 어디서부터
시작할지 — 그리고 첫 미완료 단계로 진행할지 묻는다. 모든 단계가 완료 상태면 그대로
보고하고 종료한다(최적 상태).

## Stage 1 — Baseline (기준 문서 — 개념의 상위 기준)

architecture.md / infra.md가 아직 템플릿이면:

- 이것이 **개념의 상위 기준**(높은 층이 낮은 층의 개념을 제약)임을 한 줄로 설명하고,
  작성 방식을 묻는다:
  1. **코드 분석 초안 (권장)** — 에이전트가 코드베이스를 분석해 현재 구현 기준의
     architecture/infra 초안을 작성해 보여준다. 초안은 **제안일 뿐 저장이 아니다** —
     사용자가 리뷰·수정·확정한 뒤에만 `conceptpowers:update-baseline` 절차로 저장한다.
     리뷰 때 반드시 안내: "이 초안은 **현재 구현(as-is)**을 읽은 것입니다. 기준 문서(baseline)는
     **의도(to-be)**의 기준이므로, 구현과 다르게 가야 할 부분이 있으면 지금 고쳐주세요."
  2. **직접 작성** — 사용자가 내용을 말하고 에이전트는 받아 적는다.
  3. **건너뛰기** — "기준 문서(baseline) 없이 정의된 개념은 나중에 상위 기준과 어긋날 수 있다"고
     한 줄 경고하고 다음 단계로.
- 어느 방식이든 **사용자 확인 없이 저장하지 않는다** (초안 제시는 허용, 무단 저장 금지 —
  human-owns-contract).

## Stage 2 — Define (개념 정의)

1. **reference 확인 (실행 전 필수)**: `reference/`가 비어 있으면 —
   "reference/ 폴더가 비어 있습니다. 이대로 진행하면 코드·UI만 근거로 개념 후보를 뽑게
   됩니다. 용어집·PRD·외부 명세가 있다면 지금 넣는 것이 정의 품질에 좋습니다."
   → **① 그냥 진행 / ② 파일을 넣을 테니 잠시 중단 / ③ 외부 로컬 경로 등록**(경로 여러 개
   가능 — 입력받아 `reference/paths.md`에 기록하면 정의 시 바로 사용)을 묻는다.
   조용히 건너뛰지 않는다. 개념 정의(define-concept)가 reference를 읽는 **유일한** 시점이다 —
   이후 검증·감사는 정의된 개념만 근거로 한다.
2. `conceptpowers:define-concept` 실행. 기존 개념이 없거나 적으면 **batch(전체 일괄 정의)**
   모드를 권장하고, 사용자가 특정 개념만 원하면 single 플로우로.
3. define 내부의 체크포인트(후보 범위 확정, 일괄 리뷰)는 그 스킬 규칙 그대로 따른다 —
   auto가 대신 답하지 않는다.

## Stage 3 — Check (audit 전수 점검)

1. `conceptpowers:audit` 실행 — **정의된 개념만 근거로 판정**한다(reference 내용 안 읽음,
   그 스킬 절차 그대로).
2. 결과를 항목별로 보고하고 **각각 어떻게 처리할지** 묻는다:
   - **개념 없는 gap** → define으로 되돌아가 정의(Stage 2 루프백) / `@concept:none` 마킹 / 보류.
   - **판단 불가(개념 모호)** → 해당 개념의 어느 규칙이 모호한지 보여주고, define-concept의
     업그레이드 진입점으로 보강 권장(Stage 2 루프백 — 그때 reference를 읽는다) / 보류.
   - **🔴 red(미승인)** → 사용자가 검토 후 승인 원하면 `conceptpowers:update-baseline` 승인 플로우(사용자
     게이트 — auto가 스스로 승인하지 않는다) / 보류.
   - **🟡 pending(미정착)** → `conceptpowers:check-consistency` 재실행으로 정착 시도 /
     수정·분리 논의 / 보류.
   - **품질 미달 green** → 부족한 규칙을 사용자에게 물어 채운다(자동 채움 금지).
3. 루프백으로 개념이 바뀌었으면 audit을 한 번 더 돌려 수렴을 확인한다.

## Stage 4 — Mapping (개념 ↔ 코드 배선)

1. audit에서 나온 미태깅 파일에 `@concept:<slug>`(해당 개념) 또는 `@concept:none`
   (개념 무관 코드)을 단다 — 규칙은 `conceptpowers:update-mapping` 그대로.
2. `node "<cli>" map --root . <files...>`로 캐시 갱신, `node "<cli>" render --root .`로
   뷰어·그래프 재생성.

## Final report

진단(Stage 0) 스냅샷과 현재를 비교해 보고한다:

- 단계별 결과: 완료 / 건너뜀(사용자 선택) / 보류 항목.
- 남은 일: 미승인 🔴, 미정착 🟡, 보류한 gap 등 — 각각 어느 스킬로 이어가면 되는지.
- `/conceptpowers:auto`는 언제든 재실행해 남은 단계부터 이어갈 수 있다고 안내.
- 뷰어 확인: `npm run concepts:view`.

## Prohibited

- 사용자 확인 없이 단계를 연속 실행하는 것.
- 기준 문서(baseline)·개념 내용을 **사용자 확인 없이** 저장하는 것 (human-owns-contract — 초안을
  만들어 보여주는 것은 허용, 확정은 언제나 사람).
- 🔴 red 개념을 auto가 스스로 승인하는 것 (settled-status — 승인은 사용자 요청 + update-baseline 승인 플로우).

## Viewer handoff (마지막 단계 — 생략 금지)

After `render`, always end with a clickable viewer link (render prints the path + serve command).
Reuse the running server's URL if one is up — deep-link `#/concept/<slug>` / `#/group/__features/<slug>` / `#/architecture` —
otherwise start `concepts:view` in the background (fallback: `node docs/conceptpowers/concepts/viewer/serve.mjs`) and print its URL.
