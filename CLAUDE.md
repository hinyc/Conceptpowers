# Conceptpowers — 개발 노트

- 엔진: `src/` (TS, ESM). 빌드 `pnpm build` → `dist/`.
- 훅은 `dist/hooks/*.js`를 직접 실행하므로 **배포 전 빌드 필수**.
- 테스트: `pnpm test` (vitest, 80%+).
- 스키마 변경 시 `src/schema/concept.ts`와 뷰어/감사 영향 확인.
- 기준 문서(baseline, `docs/conceptpowers`)는 임의(에이전트 판단) 수정 금지. 단 **사용자가 변경을 명시 승인하면** 개념 수정 가능 —
  `edit-concept`로 적용하면 green→pending으로 내려가고, `check-consistency` 재통과(증빙 기록) 후
  사용자 확인 아래 green으로 재정착해야 개념으로 재활성화된다 (CLI `approve`는 red 전용).

# git 관련 동작 (commit, push 등)

- hinyc 계정으로 전환 후 진행
- 동작완료후 이전 계정으로 복구
