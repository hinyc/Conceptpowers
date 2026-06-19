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

describe('versionCheck', () => {
  const base = { version: '0.1.0', enabled: true } as const
  it('누락 시 기본값 true', () => {
    expect(parseInitConfig({ ...base }).versionCheck).toBe(true)
  })
  it('false로 명시하면 false', () => {
    expect(parseInitConfig({ ...base, versionCheck: false }).versionCheck).toBe(false)
  })
})
