// tests/schema/feature.test.ts
import { describe, it, expect } from 'vitest'
import { parseFeature } from '../../src/schema/feature.js'

const valid = { slug: 'user-login', title: 'User Login' }

describe('FeatureSchema', () => {
  it('최소 필드(slug, title)로 파싱하고 기본값을 채운다', () => {
    const f = parseFeature(valid)
    expect(f.slug).toBe('user-login')
    expect(f.title).toBe('User Login')
    expect(f.group).toBe('')
    expect(f.description).toBe('')
    expect(f.concepts).toEqual([])
    expect(f.codePaths).toEqual([])
  })
  it('관련 개념(concepts)과 구현 경로(codePaths)를 보존한다', () => {
    const f = parseFeature({ ...valid, concepts: ['auth', 'session'], codePaths: ['src/auth/login.ts'] })
    expect(f.concepts).toEqual(['auth', 'session'])
    expect(f.codePaths).toEqual(['src/auth/login.ts'])
  })
  it('slug가 kebab-case가 아니면 거부한다', () => {
    expect(() => parseFeature({ ...valid, slug: 'User_Login' })).toThrow()
  })
  it('concepts 항목이 kebab-case slug가 아니면 거부한다', () => {
    expect(() => parseFeature({ ...valid, concepts: ['Not Slug'] })).toThrow()
  })
  it('title이 비면 거부한다', () => {
    expect(() => parseFeature({ slug: 'x', title: '' })).toThrow()
  })
  it('group은 중첩 경로를 허용한다', () => {
    expect(parseFeature({ ...valid, group: 'auth/web' }).group).toBe('auth/web')
  })
})
