---
name: conceptpowers-define-concept
description: Use BEFORE adding a new feature/behavior/role/permission/term when no concept covers it in a Conceptpowers-active project. Defines a structured concept (설명/목적/핵심행동/운영원칙) and saves it after a consistency check.
---

# Conceptpowers: Define Concept

새 기능·동작·역할·권한·용어에 해당하는 개념이 없을 때, 개념을 먼저 정의한다. (규칙 2/6)

## 절차 (대화형)

1. `features/`의 관련 기능 명세를 확인한다. 없으면 사용자와 함께 한 줄 명세부터 정한다.
2. 개념의 **범주(category)**를 정한다: feature | behavior | role | permission | term (복수 가능).
3. 다음 구조를 사용자와 함께 채운다 (LGEHS Admin Role 예시 구조):
   - **설명**: 핵심 정의, 비유, 구성요소, 예시
   - **목적**: 존재 이유, 기대효과, 비전, 페인포인트
   - **핵심 행동**: 허용(allow) / 제한(restrict) / 상호작용
   - **운영 원칙**: 불변 원칙, 트레이드오프, 라이프사이클
4. slug(kebab-case, 전역 고유)과 group(도메인)을 정한다.
5. **무모순 검사**: `conceptpowers-check-consistency` 스킬을 실행해 기존 개념과 충돌·위배가 없는지 확인한다.
   - 충돌이 있으면 **저장하지 않고** 사용자에게 해소(개념 조정/분리)를 요청한다. (규칙 7)
6. 통과 시 JSON으로 저장한다. 개념 데이터 파일을 직접 쓰거나, 저장 후 뷰어를 재생성한다:
   `node "<cli>" render --root .`
7. 정의한 개념을 코드와 연결할 때 `@concept:<slug>` 태그를 사용하도록 안내한다.

## 산출물

- `docs/conceptpowers/concepts/data/<group>/<slug>.json` (스키마 준수)
- 갱신된 뷰어 HTML
