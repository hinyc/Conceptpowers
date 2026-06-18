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
})
