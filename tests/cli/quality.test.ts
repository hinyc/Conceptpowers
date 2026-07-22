import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../src/cli.js'
import { writeConcept } from '../../src/store/conceptStore.js'
import { readAttestLog } from '../../src/concept/attest.js'
import { scaffoldInit } from '../../src/init/scaffold.js'

function conceptInput(rules: string[]) {
  return {
    slug: 'cli-target', category: ['behavior'], title: 'T',
    description: { definition: '정의' }, purpose: { reason: '이유' },
    actions: {},
    principle: { immutableRules: rules },
  }
}

describe('cli: quality / attest-consistency', () => {
  let root: string
  let output: string
  const out = (s: string) => { output += s }
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-cli-q-'))
    await scaffoldInit(root, {}) // init 가드 통과 (CLI는 init 없이는 거부됨)
    output = ''
  })

  it('quality: 결격 개념은 exit 1 + deficiencies JSON', async () => {
    await writeConcept(root, conceptInput([]))
    const code = await runCli(['quality', 'cli-target', '--root', root], out)
    expect(code).toBe(1)
    const parsed = JSON.parse(output)
    expect(parsed.ok).toBe(false)
    expect(parsed.deficiencies.length).toBeGreaterThan(0)
  })

  it('quality: 통과 개념은 exit 0', async () => {
    await writeConcept(root, conceptInput(['결제 완료 후 price 변경 불가']))
    const code = await runCli(['quality', 'cli-target', '--root', root], out)
    expect(code).toBe(0)
    expect(JSON.parse(output).ok).toBe(true)
  })

  it('quality: 없는 slug는 exit 1 + error', async () => {
    const code = await runCli(['quality', 'no-such', '--root', root], out)
    expect(code).toBe(1)
    expect(JSON.parse(output).error).toMatch(/not found/i)
  })

  it('attest-consistency: pass 기록이 저장된다', async () => {
    await writeConcept(root, conceptInput(['결제 완료 후 price 변경 불가']))
    const code = await runCli(
      ['attest-consistency', 'cli-target', '--result', 'pass', '--root', root], out)
    expect(code).toBe(0)
    const log = await readAttestLog(root)
    expect(log['cli-target']?.result).toBe('pass')
  })

  it('attest-consistency: result가 pass|conflict 외면 exit 1', async () => {
    await writeConcept(root, conceptInput(['결제 완료 후 price 변경 불가']))
    const code = await runCli(
      ['attest-consistency', 'cli-target', '--result', 'yes', '--root', root], out)
    expect(code).toBe(1)
  })
})
