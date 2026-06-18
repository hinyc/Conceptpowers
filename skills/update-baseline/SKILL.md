---
name: conceptpowers-update-baseline
description: Use ONLY when the user explicitly asks to modify the baseline (a concept, feature spec, architecture, or infra) in a Conceptpowers-active project. The agent never modifies baseline on its own.
---

# Conceptpowers: Update Baseline (사용자 전속)

baseline(`docs/conceptpowers/` 전체)을 수정한다. (규칙 4)

## 전제

- **사용자가 명시적으로 수정을 요청**했을 때만 실행한다. 코드 작업 도중 임의 수정 금지.

## 절차

1. 어떤 baseline을 바꾸는지 확인한다: 개념 / 기능명세 / 아키텍처 / 인프라.
2. **개념을 수정하는 경우**:
   - 변경안을 적용하기 전에 `conceptpowers-check-consistency`로 다른 개념과 충돌·위배를 검사한다.
   - 충돌 0건일 때만 저장하고 뷰어를 재생성한다: `node "<cli>" render --root .`
   - 개념 변경이 기존 코드(@concept 연결)에 영향을 주면, 영향 범위를 사용자에게 보고한다.
3. **아키텍처/인프라/기능명세를 수정하는 경우**: 해당 변경이 개념을 바꿔야 하는지 사용자와 함께 검토한다(상위 기준이 하위 개념을 제약, D9).
4. 변경 내역을 사용자에게 요약 보고한다.
