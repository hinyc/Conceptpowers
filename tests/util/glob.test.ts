// tests/util/glob.test.ts
import { describe, it, expect } from 'vitest'
import { matchesAny } from '../../src/util/glob.js'

describe('matchesAny', () => {
  it('* 는 슬래시를 넘지 않는 단일 세그먼트만 매칭한다', () => {
    expect(matchesAny('a.ts', ['*.ts'])).toBe(true)
    expect(matchesAny('src/a.ts', ['*.ts'])).toBe(false)
  })
  it('** 는 슬래시를 포함한 임의 경로를 매칭한다', () => {
    expect(matchesAny('src/a.d.ts', ['**/*.d.ts'])).toBe(true)
    expect(matchesAny('a.d.ts', ['**/*.d.ts'])).toBe(true)
    expect(matchesAny('src/deep/x.d.ts', ['**/*.d.ts'])).toBe(true)
    expect(matchesAny('src/a.ts', ['**/*.d.ts'])).toBe(false)
  })
  it('디렉터리 글롭(**/types/**)을 매칭한다', () => {
    expect(matchesAny('src/types/foo.ts', ['**/types/**'])).toBe(true)
    expect(matchesAny('types/foo.ts', ['**/types/**'])).toBe(true)
    expect(matchesAny('src/typesx/foo.ts', ['**/types/**'])).toBe(false)
  })
  it('**/dir/** 는 이름이 dir로 끝나는 형제 디렉터리를 매칭하지 않는다(경계)', () => {
    expect(matchesAny('src/mytypes/x.ts', ['**/types/**'])).toBe(false)
    expect(matchesAny('prototypes/x.ts', ['**/types/**'])).toBe(false)
    expect(matchesAny('src/util/glob.ts', ['**/utils/**'])).toBe(false)
  })
  it('경로 중간 bare ** 는 임의 깊이를 매칭한다', () => {
    expect(matchesAny('a/b', ['a/**/b'])).toBe(true)
    expect(matchesAny('a/x/y/b', ['a/**/b'])).toBe(true)
  })
  it('접두 디렉터리 글롭(scripts/**)을 매칭한다', () => {
    expect(matchesAny('scripts/build.mjs', ['scripts/**'])).toBe(true)
    expect(matchesAny('src/scripts/x.ts', ['scripts/**'])).toBe(false)
  })
  it('config 글롭(**/*.config.*)을 매칭한다', () => {
    expect(matchesAny('vite.config.ts', ['**/*.config.*'])).toBe(true)
    expect(matchesAny('src/app.config.js', ['**/*.config.*'])).toBe(true)
  })
  it('여러 글롭 중 하나라도 매칭되면 true', () => {
    expect(matchesAny('src/utils/x.ts', ['**/types/**', '**/utils/**'])).toBe(true)
  })
  it('빈 글롭 목록이면 항상 false', () => {
    expect(matchesAny('src/a.ts', [])).toBe(false)
  })
  it('정규식 특수문자를 리터럴로 취급한다', () => {
    expect(matchesAny('a+b.ts', ['a+b.ts'])).toBe(true)
    expect(matchesAny('axb.ts', ['a+b.ts'])).toBe(false)
  })
  it('백슬래시 경로를 정규화해 매칭한다', () => {
    expect(matchesAny('src\\types\\foo.ts', ['**/types/**'])).toBe(true)
  })
})
