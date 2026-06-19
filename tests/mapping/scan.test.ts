// tests/mapping/scan.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanTags, buildMapping, writeMappingCache, readMappingCache } from '../../src/mapping/scan.js'

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
  it('readMappingCache는 쓰고 다시 읽으면 동일하다', async () => {
    await writeMappingCache(root, { 'admin-role': ['src/a.ts'] })
    expect(await readMappingCache(root)).toEqual({ 'admin-role': ['src/a.ts'] })
  })
  it('readMappingCache는 형식이 깨진 캐시면 빈 객체로 폴백한다 (M3/zod)', async () => {
    const cache = join(root, 'docs/conceptpowers/.cache')
    mkdirSync(cache, { recursive: true })
    writeFileSync(join(cache, 'mapping.json'), '{"admin-role": "not-an-array"}')
    expect(await readMappingCache(root)).toEqual({})
  })
})
