// tests/mapping/scan.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanTags, buildMapping } from '../../src/mapping/scan.js'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src/a.ts'), '// @concept:admin-role\nexport const a = 1\n')
  writeFileSync(join(root, 'src/b.ts'), '/* @concept:user-role @concept:admin-role */\n')
})

describe('mapping scan', () => {
  it('파일에서 @concept 태그를 추출한다', async () => {
    const tags = await scanTags(root, ['src/a.ts', 'src/b.ts'])
    expect(tags).toEqual({
      'src/a.ts': ['admin-role'],
      'src/b.ts': ['user-role', 'admin-role']
    })
  })
  it('slug → 파일 매핑을 만든다', async () => {
    const m = await buildMapping(root, ['src/a.ts', 'src/b.ts'])
    expect(m['admin-role'].sort()).toEqual(['src/a.ts', 'src/b.ts'])
    expect(m['user-role']).toEqual(['src/b.ts'])
  })
})
