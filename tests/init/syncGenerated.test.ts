// tests/init/syncGenerated.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncGenerated } from '../../src/init/syncGenerated.js'
import { scaffoldInit } from '../../src/init/scaffold.js'
import { VIEWER_SCRIPT_NAME, VIEWER_COMMAND } from '../../src/init/packageScript.js'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })
const viewer = (rel: string) => join(root, 'docs/conceptpowers/concepts/viewer', rel)

describe('syncGenerated', () => {
  it('뷰어 에셋과 manifest를 (재)생성한다', async () => {
    await scaffoldInit(root, {})
    const r = await syncGenerated(root)
    expect(existsSync(viewer('index.html'))).toBe(true)
    expect(existsSync(viewer('assets/viewer.js'))).toBe(true)
    expect(existsSync(viewer('serve.mjs'))).toBe(true)
    expect(existsSync(viewer('manifest.json'))).toBe(true)
    expect(r.scriptStatus).toBe('no-package') // package.json 없음
  })

  it('옛 포맷 고아 *.html을 정리하고 index.html은 보존한다', async () => {
    await scaffoldInit(root, {})
    // 옛 포맷 잔재를 인위적으로 만든다
    mkdirSync(viewer('auth'), { recursive: true })
    mkdirSync(viewer('features'), { recursive: true })
    writeFileSync(viewer('graph.html'), '<old/>')
    writeFileSync(viewer('auth/admin-role.html'), '<old/>')
    writeFileSync(viewer('features/login.html'), '<old/>')

    const r = await syncGenerated(root)
    expect(r.orphansRemoved).toBe(3)
    expect(existsSync(viewer('graph.html'))).toBe(false)
    expect(existsSync(viewer('auth/admin-role.html'))).toBe(false)
    expect(existsSync(viewer('auth'))).toBe(false) // 비워진 디렉터리 정리
    expect(existsSync(viewer('features'))).toBe(false)
    expect(existsSync(viewer('index.html'))).toBe(true) // 보존
    expect(existsSync(viewer('assets/viewer.js'))).toBe(true) // assets 보존
  })

  it('옛 concepts:view(open …) 스크립트를 표준 명령으로 교체한다', async () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'demo',
      scripts: { [VIEWER_SCRIPT_NAME]: 'open docs/conceptpowers/concepts/viewer/index.html' }
    }))
    await scaffoldInit(root, {})
    const r = await syncGenerated(root)
    expect(r.scriptStatus).toBe('unchanged') // scaffoldInit가 이미 표준으로 맞춤
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    expect(pkg.scripts[VIEWER_SCRIPT_NAME]).toBe(VIEWER_COMMAND)
  })
})
