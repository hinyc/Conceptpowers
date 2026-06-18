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
  it('기본 approvalMode는 manual', () => {
    expect(parseInitConfig({ version: '0.1.0', enabled: true }).approvalMode).toBe('manual')
  })
  it('cli approvalMode를 허용한다', () => {
    expect(parseInitConfig({ version: '0.1.0', enabled: true, approvalMode: 'cli' }).approvalMode).toBe('cli')
  })
  it('알 수 없는 approvalMode를 거부한다', () => {
    expect(() => parseInitConfig({ version: '0.1.0', enabled: true, approvalMode: 'auto' })).toThrow()
  })
})
