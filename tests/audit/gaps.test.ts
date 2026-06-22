// tests/audit/gaps.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findConceptlessFiles } from '../../src/audit/gaps.js'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'))
  mkdirSync(join(root, 'src'), { recursive: true })
})

const DEFAULT_IGNORE = ['**/*.d.ts', '**/types/**', '**/utils/**']

describe('findConceptlessFiles', () => {
  it('@concept 태그가 있는 코드 파일은 통과(개념 없음 아님)', async () => {
    writeFileSync(join(root, 'src/a.ts'), '// @concept:admin-role\nexport const a = 1\n')
    expect(await findConceptlessFiles(root, ['src/a.ts'], DEFAULT_IGNORE)).toEqual([])
  })
  it('태그가 없는 코드 파일은 개념 없는 코드로 검출한다', async () => {
    writeFileSync(join(root, 'src/b.ts'), 'export const b = 1\n')
    expect(await findConceptlessFiles(root, ['src/b.ts'], DEFAULT_IGNORE)).toEqual(['src/b.ts'])
  })
  it('여러 개념 태그를 가진 파일도 통과한다(다중 컨셉 허용)', async () => {
    writeFileSync(join(root, 'src/c.ts'), '/* @concept:user-role @concept:admin-role */\n')
    expect(await findConceptlessFiles(root, ['src/c.ts'], DEFAULT_IGNORE)).toEqual([])
  })
  it('ignoreGlobs에 매칭되는 파일은 태그 없어도 제외한다', async () => {
    mkdirSync(join(root, 'src/utils'), { recursive: true })
    writeFileSync(join(root, 'src/utils/x.ts'), 'export const x = 1\n')
    writeFileSync(join(root, 'src/y.d.ts'), 'export type Y = number\n')
    expect(await findConceptlessFiles(root, ['src/utils/x.ts', 'src/y.d.ts'], DEFAULT_IGNORE)).toEqual([])
  })
  it('비코드 확장자(.md/.json/.css)는 대상이 아니다', async () => {
    writeFileSync(join(root, 'README.md'), '# hi\n')
    writeFileSync(join(root, 'data.json'), '{}\n')
    expect(await findConceptlessFiles(root, ['README.md', 'data.json'], DEFAULT_IGNORE)).toEqual([])
  })
  it('읽을 수 없는 파일(삭제/부재)은 개념 없음으로 보지 않고 건너뛴다', async () => {
    expect(await findConceptlessFiles(root, ['src/gone.ts'], DEFAULT_IGNORE)).toEqual([])
  })
  it('태그 있는 파일과 없는 파일이 섞이면 없는 것만 반환', async () => {
    writeFileSync(join(root, 'src/a.ts'), '// @concept:admin-role\n')
    writeFileSync(join(root, 'src/b.ts'), 'export const b = 1\n')
    expect(await findConceptlessFiles(root, ['src/a.ts', 'src/b.ts'], DEFAULT_IGNORE)).toEqual(['src/b.ts'])
  })
})
