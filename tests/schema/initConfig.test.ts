// @concept:concept-driven-tests @concept:governance-mode
import { describe, it, expect } from 'vitest';
import { parseInitConfig } from '../../src/schema/initConfig.js';

describe('InitConfig', () => {
  it('기본 backfillMode는 incremental', () => {
    const c = parseInitConfig({ version: '0.1.0', enabled: true });
    expect(c.backfillMode).toBe('incremental');
  });
  it('strict를 허용한다', () => {
    expect(
      parseInitConfig({ version: '0.1.0', enabled: true, backfillMode: 'strict' }).backfillMode
    ).toBe('strict');
  });
  it('enabled가 true가 아니면 거부한다', () => {
    expect(() => parseInitConfig({ version: '0.1.0', enabled: false })).toThrow();
  });
  it('기본 locale은 ko', () => {
    expect(parseInitConfig({ version: '0.1.0', enabled: true }).locale).toBe('ko');
  });
  it('en locale을 허용한다', () => {
    expect(parseInitConfig({ version: '0.1.0', enabled: true, locale: 'en' }).locale).toBe('en');
  });
  it('알 수 없는 locale을 거부한다', () => {
    expect(() => parseInitConfig({ version: '0.1.0', enabled: true, locale: 'fr' })).toThrow();
  });
});

describe('ignoreGlobs', () => {
  const base = { version: '0.1.0', enabled: true } as const;
  it('누락 시 합리적 기본값을 채운다', () => {
    const g = parseInitConfig({ ...base }).ignoreGlobs;
    expect(Array.isArray(g)).toBe(true);
    // 자동 제외 대상: 생성물·빌드 산출물·외부 의존성
    expect(g).toContain('docs/conceptpowers/**');
    expect(g).toContain('dist/**');
    expect(g).toContain('node_modules/**');
    expect(g).toContain('**/*.generated.*');
    // utils/types/config 등 손으로 쓴 코드는 더 이상 자동 제외하지 않는다(@concept:none 필요)
    expect(g).not.toContain('**/utils/**');
    expect(g).not.toContain('**/*.d.ts');
    expect(g).not.toContain('**/*.config.*');
  });
  it('스캐폴드 산출물 경로(뷰어 js)를 매칭 제외한다', () => {
    const { ignoreGlobs } = parseInitConfig({ version: '0.1.0', enabled: true });
    // matchesAny는 util 테스트에서 검증하므로 여기선 글롭 존재만 확인하고
    // 실제 매칭은 gaps/preToolUse 테스트에서 커버한다.
    expect(ignoreGlobs.some((g) => g === 'docs/conceptpowers/**')).toBe(true);
  });
  it('사용자 지정 목록으로 덮어쓴다', () => {
    const g = parseInitConfig({ ...base, ignoreGlobs: ['**/*.test.*'] }).ignoreGlobs;
    expect(g).toEqual(['**/*.test.*']);
  });
});

describe('versionCheck', () => {
  const base = { version: '0.1.0', enabled: true } as const;
  it('누락 시 기본값 true', () => {
    expect(parseInitConfig({ ...base }).versionCheck).toBe(true);
  });
  it('false로 명시하면 false', () => {
    expect(parseInitConfig({ ...base, versionCheck: false }).versionCheck).toBe(false);
  });
});

describe('conceptDrivenTests', () => {
  const base = { version: '0.1.0', enabled: true } as const;
  // 규칙 검증: "스위치 값이 설정에 없으면 켜진 것으로 본다" (concept-driven-tests)
  it('누락 시 기본값 true', () => {
    expect(parseInitConfig({ ...base }).conceptDrivenTests).toBe(true);
  });
  // 규칙 검증: "설정에서 스위치를 거짓으로 바꿔 이 동작을 끄는 것" (allow)
  it('false로 명시하면 false', () => {
    expect(parseInitConfig({ ...base, conceptDrivenTests: false }).conceptDrivenTests).toBe(false);
  });
  it('boolean이 아니면 거부한다', () => {
    expect(() => parseInitConfig({ ...base, conceptDrivenTests: 'yes' })).toThrow();
  });
});

describe('enforcement (거버넌스 강도)', () => {
  const base = { version: '0.1.0', enabled: true };
  it('기본값은 standard다 — 필드 없는 기존 프로젝트는 동작 불변 [규칙: 설정이 없으면 표준으로 동작]', () => {
    expect(parseInitConfig(base).enforcement).toBe('standard');
  });
  it('strict/light를 허용한다', () => {
    expect(parseInitConfig({ ...base, enforcement: 'strict' }).enforcement).toBe('strict');
    expect(parseInitConfig({ ...base, enforcement: 'light' }).enforcement).toBe('light');
  });
  it('알 수 없는 값은 거부한다 (readInitConfig가 null→standard 폴백) [규칙: 깨졌으면 표준]', () => {
    expect(() => parseInitConfig({ ...base, enforcement: 'hard' })).toThrow();
  });
});
