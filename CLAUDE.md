# Conceptpowers — 개발 노트

- 엔진: `src/` (TS, ESM). 빌드 `pnpm build` → `dist/`.
- 훅은 `dist/hooks/*.js`를 직접 실행하므로 **배포 전 빌드 필수**.
- 테스트: `pnpm test` (vitest, 80%+).
- 스키마 변경 시 `src/schema/concept.ts`와 뷰어/감사 영향 확인.
- baseline(docs/conceptpowers)은 임의(에이전트 판단) 수정 금지. 단 **사용자가 변경을 명시 승인하면** 개념 수정 가능 —
  `edit-concept`로 적용하면 green→pending으로 내려가고, 사람이 `approve`로 다시 승인해야 개념으로 재활성화된다.
