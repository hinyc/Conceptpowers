# Conceptpowers x Superpowers 함께 쓰기

두 플러그인은 충돌 없이 보완 관계로 동작한다.

## 역할 분담

| 단계            | superpowers                                           | Conceptpowers                                  |
| --------------- | ----------------------------------------------------- | ---------------------------------------------- |
| 아이디어 → 스펙 | brainstorming                                         | (스펙에서 핵심 **개념** 식별)                  |
| 스펙 → 계획     | writing-plans                                         | —                                              |
| 구현(TDD)       | test-driven-development / subagent-driven-development | check-concept으로 변경의 개념 위배 검증        |
| 개념 정의       | —                                                     | define-concept (+ check-consistency)           |
| 커밋            | —                                                     | 커밋 게이트(check-concept + check-consistency) |
| 점검            | requesting-code-review                                | audit(개념 구멍·정합성)                        |

## 권장 흐름

1. superpowers `brainstorming`으로 스펙을 만든다.
2. 스펙의 핵심 역할·권한·용어·기능을 Conceptpowers `define-concept`로 개념화한다(거버넌스 대상일 때).
3. superpowers `writing-plans` → TDD로 구현하되, 새 기능·동작 변경 시 Conceptpowers `check-concept`가 게이트한다.
4. 커밋 시 Conceptpowers 커밋 게이트가 코드·개념 정합성을 최종 확인한다.

## 충돌이 없는 이유

- 스킬 이름은 `conceptpowers-` 접두사로 분리된다.
- 훅은 가산적으로 실행되며, Conceptpowers 훅은 `init.json` 없으면 무동작이다.
- Conceptpowers는 superpowers의 프로세스 스킬을 재정의하지 않는다.
