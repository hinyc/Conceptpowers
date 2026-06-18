---
name: conceptpowers-check-concept
description: Use BEFORE writing/modifying code (including tests) that adds a feature or changes behavior in a Conceptpowers-active project. Finds the related concept(s) and judges whether the change violates their allow/restrict/immutable rules.
---

# Conceptpowers: Check Concept (코드 ↔ 개념)

새 기능·동작 변경(테스트 포함)이 관련 개념을 위배하는지 판단한다. (규칙 3/8, D5/D14)

## 적용 범위

- **대상**: 새 기능 추가, 기존 동작 변경, 관련 테스트 작성.
- **제외**: 단순 리팩터링·오타·포맷 (D5).

## 절차

1. 변경 대상 파일에서 `@concept:<slug>` 태그를 확인한다(또는 `git diff` 대상).
   태그가 없으면 관련 개념을 `concepts/data/`에서 의미적으로 탐색한다.
2. 관련 개념이 **하나도 없으면** → `conceptpowers-define-concept`로 먼저 정의(규칙 2).
3. 관련 개념의 **actions.allow / actions.restrict / principle.immutableRules**를 읽는다.
4. 계획한 변경이 위 규칙을 위배하는지 판단한다:
   - **위배 없음** → 진행. 코드 수정 시 `@concept` 태그/매핑을 함께 갱신(update-mapping).
   - **위배** → **코드를 수정하지 않는다.** 사용자에게 보고하고 둘 중 택하게 한다:
     (a) 개념을 명시적으로 업데이트(update-baseline), 또는 (b) 새 기능/개념으로 분리.
5. 테스트가 개념과 충돌하면 조용히 통과시키지 말고 사용자에게 알린다(테스트 오류 vs 개념 갱신 필요).

## 금지

- 에이전트가 개념(baseline)을 임의로 수정해 변경을 정당화하지 않는다(규칙 4).
