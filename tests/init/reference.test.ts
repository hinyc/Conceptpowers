// tests/init/reference.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureReference, listReferenceFiles } from '../../src/init/reference.js'
import { scaffoldInit } from '../../src/init/scaffold.js'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })
const ref = (rel = '') => join(root, 'docs/conceptpowers/reference', rel)

describe('ensureReference', () => {
  it('폴더와 안내 README를 생성한다 (locale 반영)', async () => {
    await scaffoldInit(root, { locale: 'ko' })
    const created = await ensureReference(root)
    expect(created).toBe(false) // scaffoldInit가 이미 만들었음
    expect(existsSync(ref('README.md'))).toBe(true)
    expect(readFileSync(ref('README.md'), 'utf8')).toContain('참고자료')
  })
  it('en locale면 영어 README', async () => {
    await scaffoldInit(root, { locale: 'en' })
    expect(readFileSync(ref('README.md'), 'utf8')).toContain('Reference materials')
  })
  it('이미 README가 있으면 덮어쓰지 않는다 (사용자 편집 보존)', async () => {
    await scaffoldInit(root, {})
    writeFileSync(ref('README.md'), '내가 고친 내용')
    expect(await ensureReference(root)).toBe(false)
    expect(readFileSync(ref('README.md'), 'utf8')).toBe('내가 고친 내용')
  })
})

describe('listReferenceFiles', () => {
  it('seed README는 제외하고 사용자 파일만, 정렬해서 반환한다', async () => {
    await scaffoldInit(root, {})
    expect(await listReferenceFiles(root)).toEqual([]) // README만 있음
    writeFileSync(ref('glossary.md'), 'g')
    mkdirSync(ref('specs'), { recursive: true })
    writeFileSync(ref('specs/api.md'), 'a')
    const files = await listReferenceFiles(root)
    expect(files).toEqual(['glossary.md', join('specs', 'api.md')])
  })
  it('폴더가 없으면 빈 배열', async () => {
    expect(await listReferenceFiles(root)).toEqual([])
  })
})
