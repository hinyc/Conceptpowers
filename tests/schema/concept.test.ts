// @concept:globally-unique-slug @concept:settled-status
// 개념 본문의 스키마를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - globally-unique-slug 불변 "이름표는 소문자·숫자·붙임표만으로 이루어진다"
//    → 잘못된 slug를 거부한다
//  - globally-unique-slug 불변 "예약어는 어떤 경우에도 실제 개념이나 기능의 이름표가 될 수 없다"
//    → 예약어 slug(constructor/__proto__/none)를 거부한다
//  - globally-unique-slug 허용 "묶음 구조와 무관하게 이름표만으로 개념이나 기능을 찾아가는 것"
//    → 유효한 group 값을 허용하고 group 경로 traversal은 거부한다 (묶음은 주소일 뿐 탈출구가 아니다)
//  - settled-status 구성요소 "초록(green) / 노랑(pending) / 빨강(red): AI 추측 또는 미승인"
//    → status 기본값은 red / green·pending을 허용 / 알 수 없는 status 값을 거부한다
//  - concept-scope 불변 "개념에는 자기가 관리하는 대상과 그 대상을 바꾸는 행동이 각각 하나 이상 있다"
//    → 관리 대상을 본문 칸으로 받는다 (없던 본문은 빈 값으로 그대로 읽힌다)
//  - concept-scope 불변 "개념에는 전형적인 한 장면으로 된 작동 원리가 있다"
//    → 작동 원리를 본문 칸으로 받는다
//  - "유효한 개념을 파싱하고 기본값을 채운다", "category가 비면·알 수 없는 값이면 거부한다"는
//    개념 본문이 갖춰야 할 형식으로, settled-status 불변 "지킬 수 있는 규칙이 실제로 적혀 있을 것"의
//    형식 쪽 최소치에 해당한다.
import { describe, it, expect } from 'vitest';
import { ConceptSchema, parseConcept } from '../../src/schema/concept.js';

const valid = {
  slug: 'admin-role',
  group: 'auth',
  category: ['role'],
  title: 'Admin Role',
  description: { definition: '운영자 권한 계층' },
  purpose: { reason: '리소스 배분' },
  actions: { allow: ['역할 지정'], restrict: ['직접 개발 불가'] },
  principle: { immutableRules: ['모든 변경은 감사 로그'] },
};

describe('ConceptSchema', () => {
  it('유효한 개념을 파싱하고 기본값을 채운다', () => {
    const c = parseConcept(valid);
    expect(c.slug).toBe('admin-role');
    expect(c.category).toEqual(['role']);
    expect(c.relations.related).toEqual([]); // 기본값
    expect(c.codeLinks).toEqual([]);
    expect(c.state.managed).toEqual([]); // 기본값 — 옛 개념 본문도 그대로 읽힌다
    expect(c.principle.operationalPrinciple).toBe(''); // 기본값
  });
  it('관리 대상과 작동 원리를 본문 칸으로 받는다', () => {
    const c = parseConcept({
      ...valid,
      state: { managed: ['부여된 역할 목록'] },
      principle: { ...valid.principle, operationalPrinciple: '역할을 주면 그 자원만 열린다' },
    });
    expect(c.state.managed).toEqual(['부여된 역할 목록']);
    expect(c.principle.operationalPrinciple).toBe('역할을 주면 그 자원만 열린다');
  });
  it('잘못된 slug를 거부한다', () => {
    expect(() => parseConcept({ ...valid, slug: 'Admin Role' })).toThrow();
  });
  it('예약어 slug(constructor/__proto__/none)를 거부한다 (보안 C-1 · none 마커 예약)', () => {
    expect(() => parseConcept({ ...valid, slug: 'constructor' })).toThrow();
    expect(() => parseConcept({ ...valid, slug: 'prototype' })).toThrow();
    expect(() => parseConcept({ ...valid, slug: 'none' })).toThrow(); // @concept:none 마커와 충돌 방지
  });
  it('category가 비면 거부한다', () => {
    expect(() => parseConcept({ ...valid, category: [] })).toThrow();
  });
  it('알 수 없는 category 값을 거부한다', () => {
    expect(() => parseConcept({ ...valid, category: ['nope'] })).toThrow();
  });
  it('group 경로 traversal을 거부한다 (C2)', () => {
    expect(() => parseConcept({ ...valid, group: '../../../tmp/evil' })).toThrow();
    expect(() => parseConcept({ ...valid, group: '../../etc' })).toThrow();
    expect(() => parseConcept({ ...valid, group: '/abs/path' })).toThrow();
  });
  it('유효한 group 값을 허용한다 (C2)', () => {
    expect(() => parseConcept({ ...valid, group: 'auth' })).not.toThrow();
    expect(() => parseConcept({ ...valid, group: 'auth/admin' })).not.toThrow();
    expect(() => parseConcept({ ...valid, group: '' })).not.toThrow();
    expect(() => parseConcept({ ...valid, group: 'my-group/sub-section' })).not.toThrow();
  });
  it('status 기본값은 red(미승인)이다', () => {
    expect(parseConcept(valid).status).toBe('red');
  });
  it('status green을 허용한다', () => {
    expect(parseConcept({ ...valid, status: 'green' }).status).toBe('green');
  });
  it('status pending을 허용한다', () => {
    expect(parseConcept({ ...valid, status: 'pending' }).status).toBe('pending');
  });
  it('알 수 없는 status 값을 거부한다', () => {
    expect(() => parseConcept({ ...valid, status: 'yellow' })).toThrow();
  });
});
