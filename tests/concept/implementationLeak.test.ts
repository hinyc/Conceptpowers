// @concept:concept-scope
// 개념 본문의 코드 표기 탐지(findImplementationLeaks)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - concept-scope 불변 "개념 본문은 코드 표기 없이 그대로 읽힌다 — 파일 경로·함수 이름·호출 방법을
//    규칙 문장의 주어나 서술어로 쓰지 않는다"
//    → 본문 속 파일 경로 / 함수 호출 표기 / 폴더 경로를 각각 찾아낸다, 코드 표기가 없으면 아무것도 못 찾는다
//  - concept-scope 금지 "파일 경로·함수 이름·호출 방법을 개념 본문의 규칙 문장에 적는 것"
//    → 이름 붙이기식 식별자(붙여쓴 영어 이름)를 찾아낸다
//  - concept-scope 허용 "코드를 가리켜야 할 때 개념 본문이 아니라 개념에 딸린 코드 연결 목록이나
//    코드 첫머리 이름표로 가리키는 것"
//    → 코드 연결 목록에 적힌 경로는 지적하지 않는다 / 다른 개념을 이름표로 부르는 것도 지적하지 않는다
//  - concept-scope 대응 "괄호 안 참고 표기까지 막지는 않는다"
//    → 찾아낸 것은 사람이 판단할 후보이므로 품질 통과 여부를 바꾸지 않는다(경고에 그친다)
import { describe, it, expect } from 'vitest';
import { findImplementationLeaks } from '../../src/concept/implementationLeak.js';
import { checkConceptQuality } from '../../src/concept/quality.js';
import { parseConcept } from '../../src/schema/concept.js';

function makeConcept(over: Record<string, unknown> = {}) {
  return parseConcept({
    slug: 'test-leak',
    category: ['behavior'],
    title: 'T',
    description: { definition: '개념은 사용자에게 하는 약속이다' },
    purpose: { reason: '약속을 분명히 하기 위해서다' },
    actions: { allow: ['사용자에게 한 약속을 그대로 지키는 것'], restrict: [] },
    principle: { immutableRules: [] },
    ...over,
  });
}

describe('findImplementationLeaks', () => {
  it('규칙 문장의 파일 경로를 찾아낸다', () => {
    const leaks = findImplementationLeaks(
      makeConcept({ principle: { immutableRules: ['저장은 src/store/conceptStore.ts를 거친다'] } })
    );
    expect(leaks).toHaveLength(1);
    expect(leaks[0].field).toBe('principle.immutableRules[0]');
    expect(leaks[0].token).toBe('src/store/conceptStore.ts');
  });

  it('규칙 문장의 함수 호출 표기를 찾아낸다', () => {
    const leaks = findImplementationLeaks(
      makeConcept({ actions: { allow: ['승격은 setConceptStatus(slug, status)로만 한다'] } })
    );
    expect(leaks.map((l) => l.token)).toContain('setConceptStatus(slug, status)');
  });

  it('붙여쓴 영어 이름(식별자 표기)을 찾아낸다', () => {
    const leaks = findImplementationLeaks(
      makeConcept({ actions: { allow: ['결정은 permissionDecision 값으로 내린다'] } })
    );
    expect(leaks.map((l) => l.token)).toContain('permissionDecision');
  });

  it('확장자 없는 폴더 경로도 찾아낸다', () => {
    const leaks = findImplementationLeaks(
      makeConcept({ purpose: { reason: '기준은 docs/conceptpowers/concepts 아래에 둔다' } })
    );
    expect(leaks.map((l) => l.token)).toContain('docs/conceptpowers/concepts');
  });

  it('코드 표기가 없는 본문에서는 아무것도 찾지 않는다', () => {
    const leaks = findImplementationLeaks(
      makeConcept({
        principle: {
          immutableRules: ['개념을 고치면 초록에서 내려오고, 사람이 확인해야 다시 올라간다'],
        },
      })
    );
    expect(leaks).toEqual([]);
  });

  it('코드 연결 목록에 적힌 경로는 지적하지 않는다', () => {
    const leaks = findImplementationLeaks(
      makeConcept({ codeLinks: ['src/concept/quality.ts', 'skills/define-concept/SKILL.md'] })
    );
    expect(leaks).toEqual([]);
  });

  it('다른 개념을 이름표로 부르는 표기는 지적하지 않는다', () => {
    const leaks = findImplementationLeaks(
      makeConcept({
        actions: {
          allow: ['개념 신호등(settled-status)과는 검사하는 시점이 다르다'],
          restrict: ['개념↔코드 연결(concept-code-mapping)이 받아 간다'],
        },
      })
    );
    expect(leaks).toEqual([]);
  });

  it('제목·이름표·관계는 본문이 아니므로 검사하지 않는다', () => {
    const leaks = findImplementationLeaks(
      makeConcept({ title: 'quality.ts 검사', aliases: ['conceptStore'] })
    );
    expect(leaks).toEqual([]);
  });

  it('찾아낸 것은 경고일 뿐 품질 통과 여부를 바꾸지 않는다', () => {
    const c = makeConcept({
      principle: { immutableRules: ['저장은 src/store/conceptStore.ts를 거친다'] },
    });
    const r = checkConceptQuality(c);
    expect(r.ok).toBe(true);
    expect(r.deficiencies).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toContain('src/store/conceptStore.ts');
  });

  it('경고가 없으면 빈 목록이다', () => {
    expect(checkConceptQuality(makeConcept()).warnings).toEqual([]);
  });
});
