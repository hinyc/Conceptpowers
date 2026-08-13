# 거버넌스 모드 (strict / standard / light) 설계

날짜: 2026-08-13
상태: 사용자 승인 완료 (구현 전)

## 배경과 목적

Conceptpowers의 커밋 게이트는 현재 단일 강도(모든 문제를 ask로 확인)로 동작한다.
프로젝트 성격에 따라 두 방향의 요구가 있다:

- 소규모·단기 프로젝트: 커밋마다 뜨는 확인 프롬프트가 도입 장벽 → 멈추지 않고 경고만 남기는 완화 모드
- 개념 우선 원칙을 강하게 지키려는 프로젝트: 개념과 어긋난 커밋은 아예 차단하고,
  진행하려면 개념을 먼저 수정하고 충돌이 없어야만 하는 강화 모드

이를 위해 커밋 게이트에 3단계 모드를 도입한다. 완화 대상은 **커밋 확인 프롬프트만**이다 —
세션 중 절차(check-concept/define-concept 선행)와 커밋 패키징 규칙은 모든 모드에서 동일하다.

## 모드 정의

`init.json`에 `enforcement: "strict" | "standard" | "light"` 필드를 추가한다. (CLI `init --mode`가 이미 backfill 의미로 존재해 충돌을 피하기 위해 `enforcement`로 명명)

| 게이트 | strict | standard (기본, 현행) | light |
|---|---|---|---|
| reference 기밀 문서 | ask | ask | ask |
| 거버넌스 7종* | 전부 검사 → 걸린 것 전체 목록과 함께 **deny** | 첫 번째 걸린 것에서 **ask** | 전부 검사 → **allow** + 통합 경고 |

\* 거버넌스 7종: 미정의 태그 · 개념 없는 코드 · 드리프트 · 품질 미달 green · 증빙 미실행 · 충돌 pending / red 참조.

### stale 생성 산출물 게이트 (추가 결정)

커밋 게이트에는 거버넌스 7종 외에 "미커밋 생성 산출물"(auto-sync가 남긴 unstaged 뷰어 산출물)
검사가 있다. 이는 개념 정합성이 아닌 정리용이므로 strict에서도 차단하지 않는다:
strict/standard = ask 유지, light = 통합 경고에 포함. 총 게이트는 9종
(기밀 1 + 거버넌스 7 + stale 산출물 1)이다.

- **strict**: 개념과 일치하지 않는 커밋은 차단(deny)한다. 진행하려면 개념을 먼저
  수정/정의하고(check-consistency 통과, 충돌 0) 해소 절차를 밟아야 한다. deny 메시지는
  걸린 문제 전체와 각 해소 경로(define-concept, 관련 코드 동반 스테이징, attest,
  사용자 승인 등)를 담아 한 번에 모두 고치도록 유도한다.
- **standard**: 현행 동작 그대로. 첫 번째 걸린 검사에서 ask — 사용자가 진행 여부를 결정한다.
- **light**: 커밋을 멈추지 않는다. 7종을 전부 검사해 걸린 것들을 `allow` +
  `additionalContext` 통합 경고로 에이전트에게 전달하고, 에이전트는 사용자에게
  "이번 커밋에서 개념 없는 코드 2건, 드리프트 1건이 경고 상태로 통과됨"처럼 요약 보고한다.

### 모드 무관 불변 사항

- reference 기밀 확인은 항상 ask — 기밀 여부는 개념 수정으로 해소할 수 없는 사람 판단 사안이다.
- 드리프트 상태로 통과한 커밋은 기존 `reconcileAfterCommit`이 커밋 후 자동으로
  history에 `ignored`로 기록한다 (light 모드 포함, 추가 구현 없음).
- red(자동 추론) 개념의 자동 승인 금지, baseline 보호, green 개념 정착 절차는 모드와 무관하게 유지된다.

### 기록 범위 (결정 사항)

light 모드에서 통과된 경고 중 **드리프트만** 기존 history 메커니즘으로 기록한다.
나머지 경고(개념 없는 코드, 증빙 미실행 등)는 별도 로그를 남기지 않는다 —
현재 상태는 `audit` 전수 스캔으로 언제든 복원 가능하므로 새 로그 파일은 만들지 않는다 (YAGNI).

### 기본값과 마이그레이션

- 스키마 기본값 `standard` — `enforcement` 필드가 없는 기존 프로젝트는 동작이 완전히 동일하다.
- `enforcement` 파싱 실패 / init.json 손상 시 `standard`로 폴백한다 (안전한 쪽).
- init 스킬은 스캐폴드 시 프로젝트 성격(수명·규모·개념 우선 정도)을 물어 3모드 중 하나를 고르게 한다.
- 모드 변경은 사용자만 한다 (init.json은 baseline — 에이전트 임의 수정 금지).

## 개념 계층 (선행 작업)

이 기능은 이 프로젝트 자신의 green 개념 `ask-only-gate`("막지 않는 문지기")와 충돌한다 —
해당 개념의 불변 규칙 "어떤 문제도 커밋을 강제로 막지 않는다"는 strict 모드와 양립 불가.
정체성 자체가 폐기되므로 개정이 아니라 **은퇴·대체**한다:

1. 새 개념 `governance-mode`(모드형 문지기)를 정의한다. 내용: 세 모드의 의미와 게이트별 동작,
   모드 무관 불변 규칙(기밀 확인 항상 ask, 드리프트 무시 기록, red 자동 승인 금지),
   기본값 standard, 모드 변경은 사용자만.
2. `ask-only-gate` 개념을 삭제하고, 이를 참조하는 `@concept:ask-only-gate` 태그
   (src/hooks/preToolUse.ts, src/hooks/postToolUse.ts)를 같은 커밋에서 새 slug로 이행하고
   update-mapping으로 매핑을 갱신한다 (게이트 규칙상 동일 커밋 필수).
3. 새 개념은 check-consistency 통과(충돌 0, attest 기록) 후 사용자 확인으로 green 정착한다.

이 삭제·대체는 baseline 변경으로, 사용자가 설계 단계에서 명시 승인했다.

## 구현 구조

- `src/hooks/gates/` 신설: 커밋 게이트 9종 검사(기밀 1 + 거버넌스 7 + stale 산출물 1)를 각각
  `(root, files, cfg) → GateFinding | null` 형태의 독립 함수로 추출한다
  (파일당 검사 1개 — 현재 preToolUse.ts의 277줄 단일 함수 해소).
- `preToolUse.ts`는 조립만 담당한다. 조립기 3종:
  - strict: 기밀 검사 먼저(ask), 이후 7종 전부 실행 → 걸린 것 전체를 deny 하나로 합성, 이후 stale 산출물 검사는 ask
  - standard: 현행과 동일한 순서로 순차 실행 → 첫 finding을 ask로 반환(stale 산출물 검사 포함, 현행 순서)
  - light: 기밀 검사 먼저(ask), 이후 7종 전부 실행 → allow + 통합 경고(stale 산출물 경고 포함)
- `src/schema/initConfig.ts`: `enforcement: z.enum(['strict','standard','light']).default('standard')` 추가.
- `skills/init`: 스캐폴드 시 3모드 선택 질문 추가 (수명·규모 기준 안내 포함).
- `cli.ts` `status`: 현재 모드 표시.
- `sessionStart` 훅: 모드별 행동 지침 한 줄 주입
  (light: "게이트가 경고만 하니 통과된 경고를 사용자에게 요약 보고하라",
  strict: "deny 시 임의 우회 금지 — 해소 절차를 밟거나 사용자에게 보고하라").

## 오류 처리

- `enforcement` 파싱 실패 → standard 폴백.
- light/strict의 전체 검사 수집 중 검사 하나가 throw해도 나머지 검사는 계속한다
  (기존 best-effort 원칙 유지).
- 게이트 메시지에 인용되는 경로/사유 텍스트는 기존과 동일하게 sanitize하며
  신뢰하지 않는 데이터로 취급한다.

## 알려진 한계

- 훅은 Claude Code 안에서 이루어지는 커밋만 지배한다. 사용자가 터미널에서 직접 실행하는
  `git commit`은 훅 밖이므로, strict의 차단은 "에이전트를 차단"하는 것이고
  사람을 물리적으로 막을 수는 없다. 이는 도구의 성격상 의도된 경계다.

## 테스트

- 게이트 검사 함수별 단위 테스트 (추출된 9종 각각).
- 모드별 조립 테스트 3벌:
  - standard = 기존 동작과 완전 동일 (회귀 없음이 핵심 검증 목표)
  - strict = 7종 전부 수집 후 deny, 기밀은 ask
  - light = 7종 전부 수집 후 allow + 통합 경고, 기밀은 ask
- stale 산출물: strict/standard=ask 유지, light=통합 경고 포함 검증.
- 스키마 테스트: 기본값 standard, 파싱 실패 폴백.
- concept-driven-tests 원칙대로 새 개념 `governance-mode`의 불변 규칙에서 시나리오를 도출하고,
  각 시나리오가 어느 규칙을 검증하는지 명시한다.
- 커버리지 80% 이상.

## 결정 이력 (브레인스토밍 Q&A)

- 완화 대상: 커밋 확인 프롬프트만 (세션 절차·패키징 규칙은 유지)
- reference 기밀 확인: 모든 모드에서 ask 유지
- light 경고 방식: 에이전트 경고 + 드리프트만 기록
- 기록 범위: 드리프트만 (통합 경고 로그 신설 안 함)
- 기본 모드: standard (init 때 사용자에게 질문)
- 모드 구성: 3모드 (strict=차단 / standard=현행 ask / light=경고)
- strict 차단 범위: 거버넌스 7종 전부
- 구현 접근: A안 (게이트 검사 함수 추출 + 모드별 조립기)
