// tests/init/packageScript.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addViewerScript, VIEWER_SCRIPT_NAME } from '../../src/init/packageScript.js'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })
const pkgPath = () => join(root, 'package.json')
const readPkg = () => JSON.parse(readFileSync(pkgPath(), 'utf8'))

describe('addViewerScript', () => {
  it('package.json이 없으면 아무것도 하지 않고 false를 반환한다', async () => {
    expect(await addViewerScript(root)).toBe(false)
    expect(existsSync(pkgPath())).toBe(false)
  })
  it('스크립트를 추가하고 기존 스크립트는 보존한다', async () => {
    writeFileSync(pkgPath(), JSON.stringify({ name: 'demo', scripts: { build: 'tsc' } }))
    expect(await addViewerScript(root, 'darwin')).toBe(true)
    const pkg = readPkg()
    expect(pkg.scripts.build).toBe('tsc')
    expect(pkg.scripts[VIEWER_SCRIPT_NAME]).toContain('open ')
    expect(pkg.scripts[VIEWER_SCRIPT_NAME]).toContain('docs/conceptpowers/concepts/viewer/index.html')
  })
  it('OS별 open 명령을 생성한다', async () => {
    writeFileSync(pkgPath(), JSON.stringify({ name: 'demo' }))
    await addViewerScript(root, 'win32')
    expect(readPkg().scripts[VIEWER_SCRIPT_NAME]).toContain('start')
  })
  it('이미 동일 스크립트가 있으면 덮어쓰지 않고 false를 반환한다', async () => {
    writeFileSync(pkgPath(), JSON.stringify({ scripts: { [VIEWER_SCRIPT_NAME]: 'custom' } }))
    expect(await addViewerScript(root)).toBe(false)
    expect(readPkg().scripts[VIEWER_SCRIPT_NAME]).toBe('custom')
  })
  it('잘못된 JSON이면 에러를 던진다', async () => {
    writeFileSync(pkgPath(), '{ not json')
    await expect(addViewerScript(root)).rejects.toThrow()
  })
})
