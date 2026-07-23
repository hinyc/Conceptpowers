// @concept:none
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { ensureReferenceGitignore } from '../../src/init/referenceGitignore.js'
import { scaffoldInit } from '../../src/init/scaffold.js'
import { cpPaths } from '../../src/paths.js'

describe('ensureReferenceGitignore', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-ref-gi-'))
  })

  it('reference/.gitignore를 생성 — 전체 무시하되 paths.md만 추적', async () => {
    const created = await ensureReferenceGitignore(root)
    expect(created).toBe(true)
    const content = await readFile(
      join(cpPaths(root).reference, '.gitignore'), 'utf8')
    expect(content).toContain('*')
    expect(content).toContain('!paths.md')
    expect(content).not.toContain('!README.md')
    expect(content).toContain('!.gitignore')
  })

  it('이미 존재하면 덮어쓰지 않고 false를 반환한다', async () => {
    const target = join(cpPaths(root).reference, '.gitignore')
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, '# custom\n', 'utf8')
    const created = await ensureReferenceGitignore(root)
    expect(created).toBe(false)
    expect(await readFile(target, 'utf8')).toBe('# custom\n')
  })

  it('init 스캐폴드가 reference/.gitignore까지 만들어준다', async () => {
    await scaffoldInit(root, {})
    const content = await readFile(
      join(cpPaths(root).reference, '.gitignore'), 'utf8')
    expect(content).toContain('!paths.md')
  })
})
