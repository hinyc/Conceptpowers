// @concept:none
// vitest.config.ts — 테스트 실행 설정. 따르는 개념 없음(도구 설정).
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/**'], lines: 80 },
  },
});
