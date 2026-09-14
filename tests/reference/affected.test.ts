// @concept:reference-sync @concept:concept-provenance
// tests/reference/affected.test.ts
// 바뀐 참고자료 → 그것을 근거로 삼은 개념(영향 개념) 찾기를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-sync 불변 "영향 개념은 개념의 근거 목록에 적힌 참고자료 좌표와 맞춰서만 고르며,
//    다른 추측으로 넓히지 않는다"
//    → 열쇠와 근거 경로가 같으면 맞는다 / 근거가 파일 이름만 적어도 등록 폴더 열쇠의 끝 이름과 맞는다
//    → 근거가 뒷부분 경로면 열쇠의 끝과 맞는다 / 같은 경로라도 코드 근거(kind=code)는 세지 않는다
//    → 백슬래시·./ 표기 차이는 흡수한다 / 아무 근거도 맞지 않는 열쇠는 영향 개념이 없다
//  - concept-provenance 구성요소 "참고자료 좌표" → 영향 개념은 어떤 근거 경로가 맞았는지 함께 돌려준다
//  - reference-sync 허용 "변경·삭제된 자료를 근거 목록에 적은 개념을 영향 개념으로 골라내는 것"
//    → 여러 개념이 맞으면 이름표 오름차순, 근거 경로는 중복 없이, 상태를 함께 돌려준다
import { describe, it, expect } from 'vitest';
import { sourceMatchesKey, findAffectedConcepts } from '../../src/reference/affected.js';
import { parseConcept, type Concept } from '../../src/schema/concept.js';

function concept(slug: string, sources: Concept['sources'], status = 'green'): Concept {
  return parseConcept({
    slug,
    category: ['behavior'],
    status,
    title: slug,
    description: { definition: '정의' },
    purpose: { reason: '이유' },
    actions: {},
    principle: {},
    sources,
  });
}

describe('sourceMatchesKey', () => {
  it('같은 경로면 맞는다', () => {
    expect(
      sourceMatchesKey('docs/conceptpowers/reference/a.md', 'docs/conceptpowers/reference/a.md')
    ).toBe(true);
  });
  it('근거가 파일 이름만 적어도 열쇠의 끝 이름과 맞는다', () => {
    expect(sourceMatchesKey('Seminar.pdf', '~/docs/seminar/Seminar.pdf')).toBe(true);
  });
  it('근거가 뒷부분 경로면 열쇠의 끝과 맞는다', () => {
    expect(sourceMatchesKey('sub/x.pdf', 'ext/sub/x.pdf')).toBe(true);
    expect(sourceMatchesKey('other/x.pdf', 'ext/sub/x.pdf')).toBe(false);
  });
  it('백슬래시·./ 표기 차이는 흡수한다', () => {
    expect(sourceMatchesKey('.\\spec\\a.md', './spec/a.md')).toBe(true);
  });
  it('이름 일부만 겹치면 맞지 않는다', () => {
    expect(sourceMatchesKey('a.md', 'ext/ba.md')).toBe(false);
  });
});

describe('findAffectedConcepts', () => {
  it('맞는 근거를 가진 개념을 이름표 오름차순으로, 근거 경로 중복 없이 돌려준다', () => {
    const concepts = [
      concept('zeta', [
        {
          kind: 'reference',
          path: 'docs/conceptpowers/reference/a.md',
          locator: '§1',
          supports: 'x',
        },
        {
          kind: 'reference',
          path: 'docs/conceptpowers/reference/a.md',
          locator: '§2',
          supports: 'y',
        },
      ]),
      concept(
        'alpha',
        [{ kind: 'reference', path: 'Seminar.pdf', locator: 'p.3', supports: 'z' }],
        'pending'
      ),
      concept('no-ref', [{ kind: 'decision', locator: '대화', supports: '사람이 정함' }]),
    ];
    const r = findAffectedConcepts(concepts, [
      'docs/conceptpowers/reference/a.md',
      '~/docs/Seminar.pdf',
    ]);
    expect(r).toEqual([
      { slug: 'alpha', status: 'pending', sourcePaths: ['Seminar.pdf'] },
      { slug: 'zeta', status: 'green', sourcePaths: ['docs/conceptpowers/reference/a.md'] },
    ]);
  });

  it('같은 경로라도 코드 근거는 세지 않는다', () => {
    const concepts = [
      concept('code-only', [{ kind: 'code', path: 'ext/a.md', locator: 'fn', supports: 'x' }]),
    ];
    expect(findAffectedConcepts(concepts, ['ext/a.md'])).toEqual([]);
  });

  it('아무 근거도 맞지 않으면 빈 목록', () => {
    const concepts = [
      concept('c', [{ kind: 'reference', path: 'other.md', locator: '', supports: 'x' }]),
    ];
    expect(findAffectedConcepts(concepts, ['ext/a.md'])).toEqual([]);
    expect(findAffectedConcepts(concepts, [])).toEqual([]);
  });
});
