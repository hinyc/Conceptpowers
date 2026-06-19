// tests/init/packageScript.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { upsertViewerScript, VIEWER_SCRIPT_NAME, VIEWER_COMMAND } from '../../src/init/packageScript.js'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })
const pkgPath = () => join(root, 'package.json')
const readPkg = () => JSON.parse(readFileSync(pkgPath(), 'utf8'))

describe('upsertViewerScript', () => {
  it('package.json이 없으면 no-package를 반환하고 파일을 만들지 않는다', async () => {
    expect(await upsertViewerScript(root)).toBe('no-package')
    expect(existsSync(pkgPath())).toBe(false)
  })
  it('스크립트가 없으면 표준 명령을 추가하고 set을 반환한다 (기존 스크립트 보존)', async () => {
    writeFileSync(pkgPath(), JSON.stringify({ name: 'demo', scripts: { build: 'tsc' } }))
    expect(await upsertViewerScript(root)).toBe('set')
    const pkg = readPkg()
    expect(pkg.scripts.build).toBe('tsc')
    expect(pkg.scripts[VIEWER_SCRIPT_NAME]).toBe(VIEWER_COMMAND)
    expect(VIEWER_COMMAND).toBe('node docs/conceptpowers/concepts/viewer/serve.mjs')
  })
  it('이미 표준 명령이면 unchanged', async () => {
    writeFileSync(pkgPath(), JSON.stringify({ scripts: { [VIEWER_SCRIPT_NAME]: VIEWER_COMMAND } }))
    expect(await upsertViewerScript(root)).toBe('unchanged')
  })
  it('플러그인이 만든 옛 명령(open …index.html)은 표준으로 교체한다', async () => {
    writeFileSync(pkgPath(), JSON.stringify({
      scripts: { [VIEWER_SCRIPT_NAME]: 'open docs/conceptpowers/concepts/viewer/index.html' }
    }))
    expect(await upsertViewerScript(root)).toBe('set')
    expect(readPkg().scripts[VIEWER_SCRIPT_NAME]).toBe(VIEWER_COMMAND)
  })
  it('사용자 커스텀 값은 보존하고 kept를 반환한다', async () => {
    writeFileSync(pkgPath(), JSON.stringify({ scripts: { [VIEWER_SCRIPT_NAME]: 'my-custom-viewer' } }))
    expect(await upsertViewerScript(root)).toBe('kept')
    expect(readPkg().scripts[VIEWER_SCRIPT_NAME]).toBe('my-custom-viewer')
  })
  it('잘못된 JSON이면 에러를 던진다', async () => {
    writeFileSync(pkgPath(), '{ not json')
    await expect(upsertViewerScript(root)).rejects.toThrow()
  })
})
