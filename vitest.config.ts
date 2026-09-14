// @concept:none
// vitest.config.ts — 테스트 실행 설정. 따르는 개념 없음(도구 설정).
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // vitest 2는 thresholds 안의 값만 읽는다(최상위 lines는 조용히 무시된다). 최소 기준은 80%이고,
      // 현재 수준보다 조금 아래에 둬서 커버리지가 떨어지면 test:coverage(릴리스 전 검증)가 실패하게 한다.
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
