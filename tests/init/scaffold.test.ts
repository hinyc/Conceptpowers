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
  it('init.json에 locale을 기록한다 (기본 ko)', async () => {
    await scaffoldInit(root, {})
    const cfg = JSON.parse(readFileSync(join(root, 'docs/conceptpowers/init.json'), 'utf8'))
    expect(cfg.locale).toBe('ko')
  })
  it('ko seed 템플릿은 한글로 작성된다', async () => {
    await scaffoldInit(root, { locale: 'ko' })
    const b = join(root, 'docs/conceptpowers')
    expect(readFileSync(join(b, 'architecture/architecture.md'), 'utf8')).toContain('# 아키텍처')
    expect(readFileSync(join(b, 'infra/infra.md'), 'utf8')).toContain('# 인프라')
  })
  it('en seed 템플릿은 영어로 작성되고 locale을 기록한다', async () => {
    await scaffoldInit(root, { locale: 'en' })
    const b = join(root, 'docs/conceptpowers')
    expect(JSON.parse(readFileSync(join(b, 'init.json'), 'utf8')).locale).toBe('en')
    expect(readFileSync(join(b, 'architecture/architecture.md'), 'utf8')).toContain('# Architecture')
    expect(readFileSync(join(b, 'infra/infra.md'), 'utf8')).toContain('# Infrastructure')
  })
  it('init 시 빈 상태 뷰어(index.html + css)를 미리 생성한다', async () => {
    await scaffoldInit(root, { locale: 'en' })
    const v = join(root, 'docs/conceptpowers/concepts/viewer')
    expect(existsSync(join(v, 'index.html'))).toBe(true)
    expect(existsSync(join(v, 'assets/concept.css'))).toBe(true)
    const html = readFileSync(join(v, 'index.html'), 'utf8')
    expect(html).toContain('<html lang="en"') // locale 반영
  })
})
