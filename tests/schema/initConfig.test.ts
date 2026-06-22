import { describe, it, expect } from 'vitest'
import { parseInitConfig } from '../../src/schema/initConfig.js'

describe('InitConfig', () => {
  it('기본 backfillMode는 incremental', () => {
    const c = parseInitConfig({ version: '0.1.0', enabled: true })
    expect(c.backfillMode).toBe('incremental')
  })
  it('strict를 허용한다', () => {
    expect(parseInitConfig({ version: '0.1.0', enabled: true, backfillMode: 'strict' }).backfillMode).toBe('strict')
  })
  it('enabled가 true가 아니면 거부한다', () => {
    expect(() => parseInitConfig({ version: '0.1.0', enabled: false })).toThrow()
  })
  it('기본 locale은 ko', () => {
    expect(parseInitConfig({ version: '0.1.0', enabled: true }).locale).toBe('ko')
  })
  it('en locale을 허용한다', () => {
    expect(parseInitConfig({ version: '0.1.0', enabled: true, locale: 'en' }).locale).toBe('en')
  })
  it('알 수 없는 locale을 거부한다', () => {
    expect(() => parseInitConfig({ version: '0.1.0', enabled: true, locale: 'fr' })).toThrow()
  })
})

describe('ignoreGlobs', () => {
  const base = { version: '0.1.0', enabled: true } as const
  it('누락 시 합리적 기본값을 채운다', () => {
    const g = parseInitConfig({ ...base }).ignoreGlobs
    expect(Array.isArray(g)).toBe(true)
    expect(g).toContain('**/*.d.ts')
    expect(g).toContain('**/utils/**')
    expect(g).toContain('docs/conceptpowers/**') // 플러그인 생성물(뷰어 등) 제외
  })
  it('스캐폴드 산출물 경로(뷰어 js)를 매칭 제외한다', () => {
    const { ignoreGlobs } = parseInitConfig({ version: '0.1.0', enabled: true })
    // matchesAny는 util 테스트에서 검증하므로 여기선 글롭 존재만 확인하고
    // 실제 매칭은 gaps/preToolUse 테스트에서 커버한다.
    expect(ignoreGlobs.some((g) => g === 'docs/conceptpowers/**')).toBe(true)
  })
  it('사용자 지정 목록으로 덮어쓴다', () => {
    const g = parseInitConfig({ ...base, ignoreGlobs: ['**/*.test.*'] }).ignoreGlobs
    expect(g).toEqual(['**/*.test.*'])
  })
})

describe('versionCheck', () => {
  const base = { version: '0.1.0', enabled: true } as const
  it('누락 시 기본값 true', () => {
    expect(parseInitConfig({ ...base }).versionCheck).toBe(true)
  })
  it('false로 명시하면 false', () => {
    expect(parseInitConfig({ ...base, versionCheck: false }).versionCheck).toBe(false)
  })
})
