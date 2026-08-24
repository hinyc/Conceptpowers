// @concept:contract-hash
// 계약 지문(contractHash)이 무엇에 반응하고 무엇에 반응하지 않는지 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - contract-hash 구성요소 "지문: 약속 부분만 모아 만든 짧은 표식" → 동일 계약이면 동일 해시(결정론적)
//  - contract-hash 불변 "약속에 해당하는 항목 중 하나라도 값이 바뀌면 반드시 다른 지문이 나온다"
//    → 계약 필드(definition)가 바뀌면 해시가 바뀐다
//  - contract-hash 불변 "약속 밖 항목만 바뀐 경우에는 지문이 달라지지 않는다"
//    → 비계약 필드(title/status/analogy)가 바뀌어도 해시는 불변
import { describe, it, expect } from 'vitest';
import { contractHash } from '../../src/drift/hash.js';
import { parseConcept } from '../../src/schema/concept.js';

const base = {
  slug: 'auth-token',
  category: ['behavior'],
  title: 'Auth Token',
  description: { definition: '토큰 발급', components: ['만료'] },
  purpose: { reason: '세션 유지' },
  actions: { allow: ['발급'], restrict: ['무한 만료'] },
  principle: { immutableRules: ['만료는 1시간'] },
};

describe('contractHash', () => {
  it('동일 계약이면 동일 해시(결정론적)', () => {
    expect(contractHash(parseConcept(base))).toBe(contractHash(parseConcept(base)));
  });
  it('계약 필드(definition)가 바뀌면 해시가 바뀐다', () => {
    const a = contractHash(parseConcept(base));
    const b = contractHash(
      parseConcept({ ...base, description: { ...base.description, definition: '바뀐 정의' } })
    );
    expect(a).not.toBe(b);
  });
  it('비계약 필드(title/status/analogy)가 바뀌어도 해시는 불변', () => {
    const a = contractHash(parseConcept(base));
    const b = contractHash(
      parseConcept({
        ...base,
        title: '다른 제목',
        status: 'green',
        description: { ...base.description, analogy: '다른 비유' },
      })
    );
    expect(a).toBe(b);
  });
});
