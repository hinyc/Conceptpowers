// @concept:none
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { ensureAlignmentGitignore } from '../../src/init/alignmentGitignore.js'
import { scaffoldInit } from '../../src/init/scaffold.js'
import { cpPaths } from '../../src/paths.js'

describe('ensureAlignmentGitignore', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-align-gi-'))
  })

  it('.alignment/.gitignore를 생성하고 last-commit을 무시 목록에 넣는다', async () => {
    const created = await ensureAlignmentGitignore(root)
    expect(created).toBe(true)
    const content = await readFile(
      join(cpPaths(root).alignmentDir, '.gitignore'), 'utf8')
    expect(content).toContain('last-commit')
  })

  it('이미 존재하면 덮어쓰지 않고 false를 반환한다', async () => {
    const target = join(cpPaths(root).alignmentDir, '.gitignore')
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, '# custom\nlast-commit\n', 'utf8')
    const created = await ensureAlignmentGitignore(root)
    expect(created).toBe(false)
    expect(await readFile(target, 'utf8')).toBe('# custom\nlast-commit\n')
  })

  it('init 스캐폴드가 .alignment/.gitignore까지 만들어준다', async () => {
    await scaffoldInit(root, {})
    const content = await readFile(
      join(cpPaths(root).alignmentDir, '.gitignore'), 'utf8')
    expect(content).toContain('last-commit')
  })
})
