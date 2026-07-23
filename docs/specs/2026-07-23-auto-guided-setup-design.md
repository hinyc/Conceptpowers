# auto — 단계 안내 오케스트레이터 설계

날짜: 2026-07-23
상태: 승인됨 (사용자 확인)

## 목표

init 이후(처음부터든 중도든) 실행하면 **현재 단계를 진단**하고, conceptpowers를 제대로 쓸 수
있는 순서 — **baseline → 개념 정의(define) → 감사(audit) → 매핑(mapping)** — 대로 스킬을
호출하며 사용자를 안내하는 오케스트레이터 스킬. 초점은 "올바른 순서의 자동 안내"다:
단계를 건너뛰어 개념 정의가 부실해지는 문제(예: reference 없이 정의, baseline 없이 정의)를
각 경계에서 사용자에게 묻는 방식으로 막는다.

## 결정 사항

| # | 결정 | 선택 | 근거 |
| - | - | - | - |
| A1 | 스킬명 | `conceptpowers:auto` | 사용자 표현 그대로, 짧고 발견 가능 |
| A2 | 진행 방식 | **단계마다 확인** | 각 스킬 실행 전 안내 + 결과 보고 후 "다음 단계 진행?" 질문. 사용자 선택(권장안) |
| A3 | check 단계 대응 | `conceptpowers:audit` | gap·red·pending·품질 미달 전수 점검이 "최적 상태" 점검에 부합 |
| A4 | 구현 범위 | SKILL.md 1개 + README 표 갱신 | 순수 오케스트레이션 — 엔진(src/)·CLI 변경 없음 |
| A5 | 재실행 | 멱등 — 진단으로 완료 단계는 건너뜀 | 중도 도입/중단 후 재개 모두 지원 |

## 단계 흐름

0. **진단(읽기 전용)**: architecture/infra 템플릿 여부, reference/ 비어있는지, 개념 수·상태
   분포(green/pending/red), features 수, CLI audit 결과(gap·unknownTags). 단계 지도를 보고하고
   시작 지점을 제시.
1. **baseline**: architecture.md/infra.md가 템플릿이면 — 개념의 상위 기준임을 설명하고 작성
   방식을 질문: 코드 분석 초안(권장, as-is 초안을 사용자가 리뷰·확정 후 저장) / 직접 작성 /
   건너뛰기. 어느 쪽이든 사용자 확인 없이는 저장하지 않음(update-baseline 경유).
2. **define**: 실행 전 reference/가 비었으면(스캐폴드 README만) "참고자료 없이 진행 vs 채우고
   재개" 질문. 이후 `conceptpowers:define-concept` 호출(개념이 적으면 batch 모드 권장).
3. **check(audit)**: `conceptpowers:audit` 호출. gap / red / pending / 품질 미달을 보고하고
   각각 처리 방법(승인 요청 → approve, 재정의 → define 루프백, 보류)을 질문.
4. **mapping**: 미태깅 파일에 `@concept:<slug>` 또는 `@concept:none` 마커 → `conceptpowers:update-mapping`
   → `render`.
5. **최종 리포트**: 진단 전/후 비교 + 남은 항목(미승인 red 등) + 재실행 안내.

## 거버넌스 합치 (check-concept)

- **human-owns-contract**: auto는 단계 경계마다 묻고, baseline·개념 내용을 스스로 채우지 않는다.
- **ask-only-gate**: 어떤 단계도 강제하지 않는다 — 건너뛰기 허용, 건너뛴 사실은 최종 리포트에 남긴다.
- **settled-status**: red 승인은 `conceptpowers:approve`(사용자 게이트)로만 위임한다.

## 산출물

- `skills/auto/SKILL.md`
- `docs/conceptpowers/features/governance/auto-guided-setup.json` (feature → concept/code 배선)
- README.md / README.ko.md 스킬 표에 행 추가
