# 개념 품질 게이트 + 충돌 검사 실행 강제 — 설계

- 날짜: 2026-07-22
- 상태: 설계 승인됨 (구현 전)
- 배경: 두 가지 강제력 공백을 메운다.
  1. **품질 공백** — 스키마가 `allow`/`restrict`/`immutableRules`를 전부 `default([])`로 허용하므로
     규칙 0개인 빈 껍데기 개념도 green이 될 수 있다.
  2. **실행 공백** — `check-consistency`는 스킬 문서일 뿐이라 에이전트가 건너뛰어도
     엔진은 검사 실행 여부를 알 수 없다.

## 원칙 (기존 철학 유지)

- 게이트는 **하드블록하지 않는다**(커밋 게이트는 항상 ask + 오버라이드 기록). 단 **green 승격은
  엔진이 하드 거부 가능** — 이미 `setConceptStatus`/`approve`의 전이 가드가 하드 거부하는 경로이므로
  일관적이다.
- **인간이 계약을 소유한다.** 품질 결격이 발견되면 에이전트는 임의로 채워넣지 않고
  사용자에게 구체적으로 질문한다.
- **증빙은 자기신고다.** LLM이 검사를 *성실히* 했는지는 기계검증 불가(기존 README 스탠스).
  이 설계의 목표는 "검사 단계를 건너뛴 채로는 승격/커밋이 진행되지 않게" 워크플로우를
  강제하고 감사 흔적을 남기는 것이다.

## A. 엔진 결정론적 품질 최소치 — 신규 `src/concept/quality.ts`

`checkConceptQuality(concept): { ok: boolean; deficiencies: string[] }`

결격 기준 (green 승격 전제조건):

| 대상 | 기준 |
| --- | --- |
| category에 feature/behavior/role/permission 포함 | `actions.allow ∪ actions.restrict ∪ principle.immutableRules` 합계 **1개 이상** |
| category가 `term` 단독 | 규칙 대신 `description.example` 비어있지 않아야 함 (용어의 계약 = 정의 + 예시) |
| 모든 규칙 문자열 | trim 후 **10자 이상** (형식적 한 줄 우회 방지의 최소선) |

- 순수 함수, 새 객체 반환(불변). 결격 사유는 사람이 읽을 메시지 목록.
- 연결 지점:
  - `setConceptStatus(green)` / `approve`: 결격 시 **하드 거부**, deficiencies를 에러 메시지로 출력.
  - CLI `quality <slug> --root .`: 단독 실행, JSON 결과 출력.
  - `audit`: 기존 green 개념의 품질 결격을 리포트 항목에 추가.

## B. LLM 품질 루브릭 — `skills/define-concept/SKILL.md` 개정

3단계(내용 채우기)와 5단계(consistency check) 사이에 **품질 자가검증 단계** 삽입:

- 각 규칙이 **위반 여부를 판별 가능한 문장**인지 검사.
  - 나쁜 예: "결제는 안전해야 함" (판별 불가)
  - 좋은 예: "결제 완료 후 price 필드는 어떤 경로로도 변경 불가" (판별 가능)
- 부족 항목 발견 시 **저장으로 진행하지 말고** 사용자에게 구체적 질문으로 채운다.
  에이전트가 임의로 채워넣는 것 금지.
- `audit/SKILL.md`에도 green 개념 품질 결격 리포트 항목 추가 (엔진 `quality` 명령 활용).

## C. 충돌 검사 증빙(attestation) — 기존 드리프트 해시 재활용

### 저장

- 신규 CLI: `attest-consistency <slug> --result pass|conflict --root .`
- 기록 위치: `docs/conceptpowers/concepts/.alignment/attest.json` (플러그인 관리 영역)
- 레코드: `{ slug, contractHash, result, at }` — `contractHash`는 기존 `src/drift/hash.ts`의
  계약 해시. **개념 내용이 바뀌면 해시가 달라져 증빙이 자동 실효**(신선도 보장).

### 강제 지점

1. **green 승격 (하드)**: `setConceptStatus(green)` / `approve`는 현재 계약 해시와 일치하는
   `result: pass` 증빙이 없으면 거부. 에러 메시지에 "check-consistency 실행 후
   attest-consistency로 기록하라"를 안내.
   - 품질 최소치(A)와 증빙(C)을 모두 통과해야 승격된다.
2. **커밋 게이트 (ask)**: `preToolUse`에서 스테이징된 개념 데이터 변경 중 신선한 `pass` 증빙이
   없는 개념이 있으면 `[WARNING] 충돌 검사 미실행` ask. 기존 게이트 철학대로 오버라이드 가능하며
   오버라이드는 기록된다.

### 스킬 연동

- `check-consistency/SKILL.md`: 검사 완료 시 결과와 무관하게 `attest-consistency`를 실행해
  기록하도록 단계 추가 (`pass`든 `conflict`든 기록 — conflict면 기존 `note-conflict`도 병행).
- `define-concept/SKILL.md` 6단계(승격): 증빙 없이는 엔진이 승격을 거부한다는 사실 명시.

## 테스트 (vitest, 기존 패턴)

- `tests/concept/quality.test.ts`: 카테고리별 최소치, term 예외, 10자 미만 결격, 불변성.
- attest 저장/조회: 해시 불일치 시 실효, pass/conflict 기록.
- `approve`/`setConceptStatus` 거부 경로: 품질 결격 시, 증빙 부재 시, 증빙 stale 시.
- `preToolUse` 게이트: 신규 ask 케이스(증빙 없는 개념 변경 스테이징).
- i18n: 신규 경고/에러 메시지 ko/en.

## 비범위 (YAGNI)

- 모호 어휘 자동 탐지(결정론 불가 — LLM 루브릭이 담당).
- 검사 "성실성" 검증(원리적으로 불가).
- 기존 green 개념의 소급 강등(감사 리포트로만 노출; 강등은 인간 결정).
