# Conceptpowers — 개발 노트

- 엔진: `src/` (TS, ESM). 빌드 `pnpm build` → `dist/`.
- 훅은 `dist/hooks/*.js`를 직접 실행하므로 **배포 전 빌드 필수**.
- 테스트: `pnpm test` (vitest, 80%+).
- 스키마 변경 시 `src/schema/concept.ts`와 뷰어/감사 영향 확인.
- baseline(docs/conceptpowers) 수정은 사용자 전속 — 코드에서 임의 수정 금지.
