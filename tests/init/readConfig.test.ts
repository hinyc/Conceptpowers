// tests/init/readConfig.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readInitConfig } from '../../src/init/readConfig.js'
import { scaffoldInit } from '../../src/init/scaffold.js'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })

describe('readInitConfig', () => {
  it('init.json을 읽어 파싱한다', async () => {
    await scaffoldInit(root, { locale: 'en' })
    const cfg = await readInitConfig(root)
    expect(cfg?.locale).toBe('en')
    expect(cfg?.enabled).toBe(true)
  })
  it('init.json이 없으면 null', async () => {
    expect(await readInitConfig(root)).toBeNull()
  })
})
