import { describe, it, expect } from 'vitest'
import { contractHash } from '../../src/drift/hash.js'
import { parseConcept } from '../../src/schema/concept.js'

const base = {
  slug: 'auth-token', category: ['behavior'], title: 'Auth Token',
  description: { definition: '토큰 발급', components: ['만료'] },
  purpose: { reason: '세션 유지' },
  actions: { allow: ['발급'], restrict: ['무한 만료'] },
  principle: { immutableRules: ['만료는 1시간'] },
}

describe('contractHash', () => {
  it('동일 계약이면 동일 해시(결정론적)', () => {
    expect(contractHash(parseConcept(base))).toBe(contractHash(parseConcept(base)))
  })
  it('계약 필드(definition)가 바뀌면 해시가 바뀐다', () => {
    const a = contractHash(parseConcept(base))
    const b = contractHash(parseConcept({ ...base, description: { ...base.description, definition: '바뀐 정의' } }))
    expect(a).not.toBe(b)
  })
  it('비계약 필드(title/eyebrow/status)가 바뀌어도 해시는 불변', () => {
    const a = contractHash(parseConcept(base))
    const b = contractHash(parseConcept({ ...base, title: '다른 제목', eyebrow: 'X', status: 'green' }))
    expect(a).toBe(b)
  })
})
