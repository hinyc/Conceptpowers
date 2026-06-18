import { describe, it, expect } from 'vitest'
import { ConceptSchema, parseConcept } from '../../src/schema/concept.js'

const valid = {
  slug: 'admin-role', group: 'auth', category: ['role'], title: 'Admin Role',
  description: { definition: '운영자 권한 계층' },
  purpose: { reason: '리소스 배분' },
  actions: { allow: ['역할 지정'], restrict: ['직접 개발 불가'] },
  principle: { immutableRules: ['모든 변경은 감사 로그'] }
}

describe('ConceptSchema', () => {
  it('유효한 개념을 파싱하고 기본값을 채운다', () => {
    const c = parseConcept(valid)
    expect(c.slug).toBe('admin-role')
    expect(c.category).toEqual(['role'])
    expect(c.relations.related).toEqual([])     // 기본값
    expect(c.codeLinks).toEqual([])
  })
  it('잘못된 slug를 거부한다', () => {
    expect(() => parseConcept({ ...valid, slug: 'Admin Role' })).toThrow()
  })
  it('category가 비면 거부한다', () => {
    expect(() => parseConcept({ ...valid, category: [] })).toThrow()
  })
  it('알 수 없는 category 값을 거부한다', () => {
    expect(() => parseConcept({ ...valid, category: ['nope'] })).toThrow()
  })
  it('group 경로 traversal을 거부한다 (C2)', () => {
    expect(() => parseConcept({ ...valid, group: '../../../tmp/evil' })).toThrow()
    expect(() => parseConcept({ ...valid, group: '../../etc' })).toThrow()
    expect(() => parseConcept({ ...valid, group: '/abs/path' })).toThrow()
  })
  it('유효한 group 값을 허용한다 (C2)', () => {
    expect(() => parseConcept({ ...valid, group: 'auth' })).not.toThrow()
    expect(() => parseConcept({ ...valid, group: 'auth/admin' })).not.toThrow()
    expect(() => parseConcept({ ...valid, group: '' })).not.toThrow()
    expect(() => parseConcept({ ...valid, group: 'my-group/sub-section' })).not.toThrow()
  })
})
