# Conceptpowers

개념(Concept) 기반 개발 거버넌스 Claude Code 플러그인.
코드를 바꾸기 전에 개념을 정의하고, 변경이 개념을 위배하지 않는지 강제 검증한다.

## 설치 (자체 마켓플레이스)

```bash
/plugin marketplace add <user>/Conceptpowers
/plugin install conceptpowers@conceptpowers-dev
```

## 사용

1. 프로젝트에서 활성화: `conceptpowers init` 스킬 호출 → `docs/conceptpowers/` 생성
2. 이후 새 기능·동작 변경 시 개념 검증이 자동 강제됨 (SessionStart 훅이 마커 자동 탐색)
3. 전체 점검: `conceptpowers audit`

## 구조

- 개념 데이터: `docs/conceptpowers/concepts/data/<group>/<slug>.json`
- 뷰어: `docs/conceptpowers/concepts/viewer/index.html`
- baseline 전체는 사용자 전속 수정.

자세한 설계: `docs/specs/2026-06-18-conceptpowers-design.md`

## superpowers와 함께 쓰기

Conceptpowers는 [superpowers](https://github.com/obra/superpowers)와 충돌 없이 보완한다.
superpowers가 개발 프로세스(아이디어→스펙→계획→TDD)를 이끌고, Conceptpowers가 개념 정의/검증 게이트를 더한다.
자세한 흐름: `docs/superpowers-interop.md`.
