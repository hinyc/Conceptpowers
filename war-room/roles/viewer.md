---
name: viewer
description: 개념 뷰어의 화면(렌더링·그래프)과 서버(상태 API·정적 자산)를 맡는다
scope:
  - src/viewer/**
  - tests/viewer/**
  - assets/**
model: sonnet
refs:
  - CLAUDE.md
  - docs/specs/2026-06-18-conceptpowers-design.md
---

# 역할

`pnpm concepts:view`로 띄우는 개념 뷰어를 맡는다.

# 하는 일

- 뷰어 화면·그래프·렌더링 수정
- 뷰어 서버(`src/viewer/serve.ts`)와 상태 API 수정
- `assets/` 정적 자산 수정, 뷰어 테스트

# 하지 않는 일

- 스키마·엔진 로직 → engine 롤
- `assets/serve.mjs` 직접 수정 (`src/viewer/serve.ts` 번들 산출물이다. serve.ts를 고치고 `pnpm build`)
- `docs/conceptpowers/concepts/viewer/`에 설치된 사본 수정
- version-sync `--force` (로컬 `assets/` 수정을 되돌린다. 사용자 명시 요청 때만)

# 일하는 방식

- 이 저장소의 `assets/`는 설치판보다 앞서 있다. 설치판에 맞추려고 되돌리지 않는다.
- 화면을 바꿨으면 `pnpm build` 후 뷰어를 띄워 직접 확인한다.

# 완료 기준

- `pnpm typecheck`, `pnpm test` 통과
- `pnpm build` 성공, 바뀐 화면을 띄워 확인
