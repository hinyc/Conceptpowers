// @concept:drift-reconcile
// 계약 지문(contractHash)이 무엇에 반응하고 무엇에 반응하지 않는지 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - drift-reconcile 구성요소 "지문: 약속 부분만 모아 만든 짧은 표식" → 동일 계약이면 동일 해시(결정론적)
//  - drift-reconcile 불변 "약속에 해당하는 항목 중 하나라도 값이 바뀌면 반드시 다른 지문이 나온다"
//    → 계약 필드(definition)가 바뀌면 해시가 바뀐다
//    → 계약 필드(관리 대상)가 바뀌면 해시가 바뀐다
//    → 계약 필드(작동 원리)가 바뀌면 해시가 바뀐다
//  - drift-reconcile 불변 "약속 밖 항목만 바뀐 경우에는 지문이 달라지지 않는다"
//    → 비계약 필드(title/status/analogy)가 바뀌어도 해시는 불변
//  - drift-reconcile 불변 "상호작용 항목은 개념 사이의 역할 경계만 서술한다 — 코드가 지켜야 할 판정
//    규칙은 상호작용이 아니라 허용 행동·제한 행동·불변 규칙에 적는다"
//    → 상호작용만 바뀌어도 지문은 달라지지 않는다 (상호작용은 약속 밖이다)
//  - drift-reconcile 구성요소 "지문: 약속 부분만 모아 만든 짧은 표식 — 지문에는 계산 규칙의
//    판(version)이 함께 적혀, 판이 다른 지문끼리는 견주지 않는다"
//    → 지문이 현재 판 접두로 시작한다 / 접두 없는 옛 지문은 1판으로 읽는다
import { describe, it, expect } from 'vitest';
import { contractHash, hashVersion, CONTRACT_HASH_VERSION } from '../../src/drift/hash.js';
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
  it('계약 필드(관리 대상)가 바뀌면 해시가 바뀐다', () => {
    const a = contractHash(parseConcept(base));
    const b = contractHash(parseConcept({ ...base, state: { managed: ['발급된 토큰 목록'] } }));
    expect(a).not.toBe(b);
  });
  it('계약 필드(작동 원리)가 바뀌면 해시가 바뀐다', () => {
    const a = contractHash(parseConcept(base));
    const b = contractHash(
      parseConcept({
        ...base,
        principle: { ...base.principle, operationalPrinciple: '로그인하면 토큰이 나온다' },
      })
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
  it('상호작용만 바뀌어도 지문은 달라지지 않는다 — 역할 경계 서술은 약속 밖이다', () => {
    const a = contractHash(parseConcept(base));
    const b = contractHash(
      parseConcept({
        ...base,
        actions: { ...base.actions, interaction: '다른 개념과의 역할 경계' },
      })
    );
    expect(a).toBe(b);
  });
  it('지문은 현재 판 접두로 시작하고, 접두 없는 옛 지문은 1판으로 읽는다', () => {
    const h = contractHash(parseConcept(base));
    expect(h.startsWith(CONTRACT_HASH_VERSION + ':')).toBe(true);
    expect(hashVersion(h)).toBe(CONTRACT_HASH_VERSION);
    expect(hashVersion('abc123def456')).toBe(1);
  });
});
