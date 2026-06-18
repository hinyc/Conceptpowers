---
name: conceptpowers-check-consistency
description: Use when defining or modifying a concept in a Conceptpowers-active project, and as the commit gate. Compares the new/changed concept against all existing concepts to detect conflicts or violations; only passes when zero conflicts.
---

# Conceptpowers: Check Consistency (개념 ↔ 개념)

개념을 추가/수정할 때 기존 모든 개념과 충돌·위배가 없는지 검증한다. (규칙 7, D11/D17)

## 절차

1. `concepts/data/`의 모든 개념을 로드한다(또는 `node "<cli>" render` 전 단계로 목록 확보).
2. 대상(신규/수정) 개념과 기존 개념들을 대조해 다음을 점검한다:
   - **권한·역할 충돌**: 같은 권한을 한 개념은 허용(allow), 다른 개념은 제한(restrict)하는가?
   - **용어 충돌**: 같은 term을 서로 다르게 정의하는가?
   - **불변 원칙 위배**: 대상 개념이 다른 개념의 immutableRules를 깨는가?
   - **상호작용 모순**: relations로 연결된 개념 간 동작 설명이 어긋나는가?
3. 충돌이 **하나라도 있으면** → 생성/수정 **중단**, 충돌 목록과 함께 사용자에게 해소를 요청한다.
4. 충돌 0건일 때만 저장/커밋을 진행한다.

## 커밋 게이트 (D17)

- `git commit` 시, 스테이징(`git diff --cached --name-only`)에 개념 데이터 변경이 있으면 본 검사를 수행한다.
- 코드 변경은 check-concept이, 개념 변경은 본 스킬이 담당하여 **구멍 없이** 커밋을 검증한다.
