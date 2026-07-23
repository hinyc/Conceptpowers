// @concept:none
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../src/cli.js'
import { scaffoldInit } from '../../src/init/scaffold.js'
import { cpPaths } from '../../src/paths.js'

describe('cli: reference', () => {
  let root: string
  let output: string
  const out = (s: string) => { output += s }
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-cli-ref-'))
    await scaffoldInit(root, {})
    output = ''
  })

  it('등록 경로가 전부 유효하면 ok=true, exit 0', async () => {
    await writeFile(join(root, 'spec.md'), '명세', 'utf8')
    await writeFile(join(cpPaths(root).reference, 'paths.md'), '- spec.md\n', 'utf8')
    const code = await runCli(['reference', '--root', root], out)
    expect(code).toBe(0)
    const r = JSON.parse(output)
    expect(r.ok).toBe(true)
    expect(r.external[0]).toMatchObject({ raw: 'spec.md', status: 'ok' })
  })

  it('없는 경로가 있으면 ok=false, exit 1', async () => {
    await writeFile(join(cpPaths(root).reference, 'paths.md'), '- no/such\n', 'utf8')
    const code = await runCli(['reference', '--root', root], out)
    expect(code).toBe(1)
    const r = JSON.parse(output)
    expect(r.ok).toBe(false)
    expect(r.external[0].status).toBe('missing')
  })

  it('paths.md가 없으면 external은 빈 배열, exit 0', async () => {
    const code = await runCli(['reference', '--root', root], out)
    expect(code).toBe(0)
    expect(JSON.parse(output).external).toEqual([])
  })
})
