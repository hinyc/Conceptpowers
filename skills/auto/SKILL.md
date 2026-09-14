---
name: auto
description: Use after init when the user wants guided operation ("auto", "다음 뭐하면 돼?", "알아서 순서대로 진행해줘") in a governance-active project, or when the viewer / concepts:view script looks stale after a plugin update. Diagnoses the current stage and walks baseline → update-concepts (reference changes + definitions) → scan (gaps + mapping) → review (code vs concepts) in the right order, asking at every stage boundary.
---

# Conceptpowers: Auto (단계 안내 오케스트레이터)

> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.

Conceptpowers는 **올바른 순서로 써야** 개념 정의가 제대로 된다 — 기준 문서(baseline) 없이 개념을 정의하거나,
바뀐 참고자료를 반영하지 않은 채 코드를 검토하거나, 격차를 메우지 않고 검토하면 결과가 부실해진다.
이 스킬은 그 순서를 대신 기억한다: 현재 단계를 진단하고 **기준 문서 → 개념 업데이트 → 상태 탐색 → 검토**
순서로 기존 스킬을 호출하며, 매 단계 경계에서 사용자에게 진행 여부를 묻는다.

## Role (orchestrator only)

- 이 스킬은 **호출과 안내만** 한다. 기준 문서·개념의 내용은 절대 직접 쓰지 않는다 — 작성은 각 스킬
  (`update-concepts`) 안에서 사용자와 함께 이뤄진다.
- **매 단계 경계에서 한 번 묻는다**: 무엇을 할지 한두 문장으로 안내 → 실행 → 결과 요약 →
  "다음 단계로 진행할까요? (진행 / 이 단계 건너뛰기 / 여기서 중단)". 확인 없이 두 단계를 연속 실행하지 않는다.
- 건너뛰기는 항상 허용된다(강제 없음). 건너뛴 단계는 최종 리포트에 남긴다.
- **멱등**: 언제든 재실행 가능. 진단에서 이미 끝난 단계는 "완료됨"으로 보고하고 자동으로 넘어간다.

## Stage 0 — Diagnose (읽기 전용, 항상 실행)

무엇도 바꾸지 말고 현재 상태만 수집한다(CLI 경로는 `CONCEPTPOWERS-ACTIVE` 세션 컨텍스트 또는 플러그인 dist):

1. **버전 동기화**: 모든 CLI 명령 앞에서 자동으로 맞춰지므로 따로 할 일은 없다 — stderr에
   `[conceptpowers] auto version-sync` 안내가 있었으면 "완료됨"으로 보고한다. 수동 실행
   (`node "<cli>" version-sync --root .`)이 `skipped: up-to-date`를 내면 그대로 둔다 — `--force` 재생성은
   사용자가 명시적으로 요청할 때만(같은 버전 재생성은 로컬 산출물 수정을 되돌릴 수 있다).
2. **기준 문서(baseline)**: `architecture/architecture.md` / `infra/infra.md`가 스캐폴드 템플릿 그대로인지.
3. **reference**: `reference/`가 비었는지(파일 없음 + `paths.md` 항목 없음) — **존재 확인만, 내용은 읽지 않는다.**
   그리고 `node "<cli>" reference-diff --root .` — `unlocked`(기준점 없음), `changed/removed`(변경),
   `affected`(영향 개념), `newMaterial`(새 개념 후보 자료), `unreachable`.
4. **개념**: `concepts/data/` 개수와 status 분포(🟢 green / 🟡 pending / 🔴 red).
5. **feature**: `features/` 명세 개수.
6. **무결성**: `node "<cli>" audit --root .` — **파일 인자 없이**(전체 스캔: `unknownTags` + `conceptless`).
   exit 1은 진단 데이터이지 실패가 아니다.

결과를 **단계 지도**로 보고한다 — 각 단계가 완료/부분/미시작인지, 어디서부터 시작할지 — 그리고 첫 미완료
단계로 진행할지 묻는다. 모두 완료면 그대로 보고하고 종료한다.

## Stage 1 — Baseline (기준 문서 — 개념의 상위 기준)

architecture.md / infra.md가 아직 템플릿이면:

- 이것이 **개념의 상위 기준**(높은 층이 낮은 층의 개념을 제약)임을 한 줄로 설명하고 작성 방식을 묻는다:
  1. **코드 분석 초안 (권장)** — 코드베이스를 분석해 현재 구현 기준의 초안을 보여준다. 초안은 **제안일 뿐
     저장이 아니다** — 사용자가 리뷰·수정·확정한 뒤에만 `update-concepts`(C) 절차로 저장한다. 리뷰 때 반드시
     안내: "이 초안은 **현재 구현(as-is)**을 읽은 것입니다. 기준 문서는 **의도(to-be)**의 기준이므로 구현과
     다르게 가야 할 부분이 있으면 지금 고쳐주세요."
  2. **직접 작성** — 사용자가 내용을 말하고 에이전트는 받아 적는다.
  3. **건너뛰기** — "기준 문서 없이 정의된 개념은 나중에 상위 기준과 어긋날 수 있다"고 한 줄 경고.
- 어느 방식이든 **사용자 확인 없이 저장하지 않는다**.

## Stage 2 — Update concepts (개념 업데이트)

`conceptpowers:update-concepts` 호출. 진단 결과에 따라 계기가 정해진다:

- `changed/removed`가 있으면 **A(참고자료 변경 반영)** — 영향 개념부터. 끝나면 사용자 확인 후 기준점 기록.
- 개념이 없거나 적으면 **B 일괄 정의(batch)**. 실행 전 reference가 비었으면 그 스킬의 안내대로 ① 진행 ② 파일
  추가 ③ 바깥 경로 등록을 묻는다 — 조용히 건너뛰지 않는다. 개념 정의가 reference를 읽는 **유일한** 시점이다.
- `unlocked`(기준점 없음)이고 개념이 이미 있으면, 정의·검토가 끝난 뒤 기준점을 한 번 찍자고 제안한다.
- 스킬 안의 체크포인트(후보 범위 확정, 일괄 리뷰, 정합성 검사)는 그 스킬 규칙 그대로 — auto가 대신 답하지 않는다.

## Stage 3 — Scan (상태 탐색)

`conceptpowers:scan` 호출 — 개념 없는 코드·깨진 태그·기능 명세 누락·red/pending·품질 결격을 목록으로 받고,
항목마다 어떻게 처리할지 묻는다:

- 개념 없는 코드 → 기존 개념 태그 / `update-concepts`로 정의(Stage 2 루프백) / `@concept:none` / 보류.
- 🔴 red → 사용자가 원하면 `update-concepts`(D) 승인 흐름(사용자 게이트 — auto가 스스로 승인하지 않는다).
- 🟡 pending → `update-concepts`(G) 재검사로 정착 시도 / 수정·분리 논의(C) / 보류.
- 품질 미달 green → 사용자에게 물어 채운다(자동 채움 금지).
- 태그 달기 + `map` + `render`는 scan 안에서 마친다.

## Stage 4 — Review (검토)

`conceptpowers:review` **전체 모드** 호출 — 매핑된 코드가 개념대로 구현됐는지 판정하고 **어긋남 목록**을 받는다.

- 위반 → 사용자가 고른다: 코드 수정(TDD, 개념 안에서) / 개념 수정(`update-concepts` C) / 기능 분리.
- 판단 불가(개념 모호) → `update-concepts`(F) 업그레이드 권장(Stage 2 루프백 — 그때 reference를 읽는다).
- 루프백으로 개념이 바뀌었으면 review를 한 번 더 돌려 수렴을 확인한다.

## Final report

진단(Stage 0) 스냅샷과 현재를 비교해 보고한다:

- 단계별 결과: 완료 / 건너뜀(사용자 선택) / 보류 항목.
- 남은 일: 어긋남 목록, 미승인 🔴, 미정착 🟡, 보류한 격차, 아직 안 찍은 기준점 — 각각 어느 스킬로 이어가면 되는지.
- `/conceptpowers:auto`는 언제든 재실행해 남은 단계부터 이어갈 수 있다고 안내.
- 뷰어 확인: `npm run concepts:view`.

## Prohibited

- 사용자 확인 없이 단계를 연속 실행하는 것.
- 기준 문서·개념 내용을 **사용자 확인 없이** 저장하는 것(초안 제시는 허용, 확정은 언제나 사람).
- 🔴 red 개념을 auto가 스스로 승인하는 것.
- 검토 없이 기준점(`reference-snapshot`)을 찍는 것.

## Viewer handoff (마지막 단계 — 생략 금지)

After `render`, always end with a clickable viewer link (render prints the path + serve command).
Reuse the running server's URL if one is up — deep-link `#/concept/<slug>` / `#/group/__features/<slug>` / `#/architecture` —
otherwise start `concepts:view` in the background (fallback: `node docs/conceptpowers/concepts/viewer/serve.mjs`) and print its URL.
