// tests/init/scaffold.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scaffoldInit, isInitialized } from '../../src/init/scaffold.js'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })

describe('scaffoldInit', () => {
  it('5요소 폴더와 init.json을 만든다', async () => {
    await scaffoldInit(root, { backfillMode: 'incremental' })
    const b = join(root, 'docs/conceptpowers')
    for (const d of ['features', 'concepts/data', 'concepts/viewer', 'architecture', 'infra'])
      expect(existsSync(join(b, d))).toBe(true)
    expect(existsSync(join(b, 'init.json'))).toBe(true)
  })
  it('init.json에 backfillMode를 기록한다', async () => {
    await scaffoldInit(root, { backfillMode: 'strict' })
    const cfg = JSON.parse(readFileSync(join(root, 'docs/conceptpowers/init.json'), 'utf8'))
    expect(cfg.enabled).toBe(true)
    expect(cfg.backfillMode).toBe('strict')
  })
  it('isInitialized가 마커 존재를 감지한다', async () => {
    expect(await isInitialized(root)).toBe(false)
    await scaffoldInit(root, {})
    expect(await isInitialized(root)).toBe(true)
  })
  it('이미 초기화된 경우 init.json을 덮어쓰지 않는다', async () => {
    await scaffoldInit(root, { backfillMode: 'strict' })
    await scaffoldInit(root, { backfillMode: 'incremental' })
    const cfg = JSON.parse(readFileSync(join(root, 'docs/conceptpowers/init.json'), 'utf8'))
    expect(cfg.backfillMode).toBe('strict') // 보존
  })
})
