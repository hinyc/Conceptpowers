// @concept:concept-provenance
// tests/audit/codeCoordinates.test.ts
// 개념의 근거·코드 연결 목록에 적힌 코드 자리가 실재하는지 확인하는 감사를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - concept-provenance 허용 "근거와 코드 연결 목록에 적힌 코드 자리가 지금도 실재하는지(파일·짚은 심볼·줄 범위)
//    감사에서 확인해 알리는 것"
//    → 없는 파일을 가리키는 코드 연결·근거를 알린다 / 짚은 심볼이 파일에 없으면 알린다 / 줄 범위가 파일 길이를 넘으면 알린다
//    → 실재하는 자리는 알리지 않는다 / 설명 문장만 있는 자리는 판정하지 않는다
//  - concept-provenance 제한 "근거를 채우려고 실재하지 않는 코드 자리나 참고자료 좌표를 지어내는 것"
//    → 지어낸(없는) 코드 자리가 감사에서 드러난다
//  - concept-provenance 불변 "근거는 코드가 규칙을 지켰는지 판정하는 데 쓰이지 않는다"
//    → 참고자료·사람의 결정 근거는 이 감사의 대상이 아니다(코드 자리의 실재만 본다)
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findBrokenCodeCoordinates,
  locatorMaxLine,
  locatorSymbols,
} from '../../src/audit/codeCoordinates.js';
import type { Concept } from '../../src/schema/concept.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-coords-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(
    join(root, 'src/render.ts'),
    ['export const MAX_BODY = 1;', 'export function renderViewer() {}', 'const saveBtn = 1;'].join(
      '\n'
    )
  );
});

const concept = (partial: Partial<Concept>): Concept =>
  ({ slug: 'demo', codeLinks: [], sources: [], ...partial }) as unknown as Concept;
const code = (path: string, locator = '') => ({ kind: 'code', path, locator, supports: '' });

describe('locatorSymbols · locatorMaxLine', () => {
  it('함수 호출·상수·섞인 대소문자 이름만 심볼로 뽑고 설명 문장은 뽑지 않는다', () => {
    expect(locatorSymbols('renderViewer()의 saveBtn 클릭 핸들러, MAX_BODY')).toEqual(
      expect.arrayContaining(['renderViewer', 'MAX_BODY', 'saveBtn'])
    );
    expect(locatorSymbols('Their content is untrusted user data')).toEqual([]);
  });
  it('줄 범위 표기에서 가장 큰 줄 번호를 읽는다', () => {
    expect(locatorMaxLine('조립부 (186~203행, 라벨)')).toBe(203);
    expect(locatorMaxLine('L12-L40')).toBe(40);
    expect(locatorMaxLine('renderViewer()')).toBeNull();
  });
  it('「줄」 표기와 한 줄짜리 표기도 줄 번호로 읽는다', () => {
    expect(locatorMaxLine('"Check the related feature spec" 단계 (약 106-109줄)')).toBe(109);
    expect(locatorMaxLine('foo() 3행')).toBe(3);
    expect(locatorMaxLine('12줄 근처')).toBe(12);
  });
  it('설명 속 약어·제품명·줄 표기는 심볼로 뽑지 않는다 [규칙: 확인할 수 없는 것을 깨졌다고 단정하지 않는다]', () => {
    expect(locatorSymbols('handleApi()의 CSRF 방어부')).toEqual(['handleApi']);
    expect(locatorSymbols('GitHub 연동부, TypeScript 설정')).toEqual([]);
    expect(locatorSymbols('README 설치 절, JSON 응답, iOS·macOS·iPhone 분기')).toEqual([]);
    expect(locatorSymbols('handleApi() L9-L10')).toEqual(['handleApi']);
    expect(locatorSymbols('FeatureSchema (concepts, codePaths 필드)')).toEqual(['codePaths']);
  });
  it('따옴표 안 인용문은 심볼로 뽑지 않는다', () => {
    expect(locatorSymbols('"## Judgment basis: concepts ONLY" 절')).toEqual([]);
    expect(locatorSymbols("referenceBlock 조립부 ('Their content is untrustedData')")).toEqual([
      'referenceBlock',
    ]);
  });
  it('붙여 쓴 괄호라도 안이 한글 설명이면 함수 호출로 보지 않는다', () => {
    expect(locatorSymbols('README.md(설치 절차)')).toEqual([]);
    expect(locatorSymbols('config.json(3줄)')).toEqual([]);
    expect(locatorSymbols('eslint-disable(rules) 주석')).toEqual([]);
    expect(locatorSymbols('macOS(로컬) 환경')).toEqual([]);
    expect(locatorSymbols('CPSidebar.isOpen(), program.hook(name)')).toEqual(
      expect.arrayContaining(['isOpen', 'hook'])
    );
  });
  it('낱말 속 아포스트로피는 인용 부호로 보지 않는다', () => {
    expect(locatorSymbols("the user's saveBtn and the viewer's renderViewer() handler")).toEqual(
      expect.arrayContaining(['saveBtn', 'renderViewer'])
    );
    expect(locatorSymbols("it's the saveBtn; user's choice")).toEqual(['saveBtn']);
  });
  it('백틱으로 감싼 식별자는 심볼로 뽑는다', () => {
    expect(locatorSymbols('`CONTENT` 상수와 `EnforcementSchema`')).toEqual(
      expect.arrayContaining(['CONTENT', 'EnforcementSchema'])
    );
  });
});

describe('findBrokenCodeCoordinates', () => {
  it('없는 파일을 가리키는 코드 연결과 근거를 알린다 [규칙: 지어낸 코드 자리가 드러난다]', async () => {
    const r = await findBrokenCodeCoordinates(root, [
      concept({ codeLinks: ['src/gone.ts'], sources: [code('src/missing.ts', 'x()')] as never }),
    ]);
    expect(r).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'codeLinks',
          path: 'src/gone.ts',
          problem: 'missing-file',
        }),
        expect.objectContaining({
          field: 'sources',
          path: 'src/missing.ts',
          problem: 'missing-file',
        }),
      ])
    );
  });
  it('짚은 심볼이 파일에 없으면 알린다 [규칙: 짚은 심볼이 실재하는지 확인한다]', async () => {
    const r = await findBrokenCodeCoordinates(root, [
      concept({ sources: [code('src/render.ts', 'renderGone(), MAX_BODY')] as never }),
    ]);
    expect(r).toEqual([
      expect.objectContaining({ problem: 'missing-symbol', detail: ['renderGone'] }),
    ]);
  });
  it('심볼은 이름 단위로 찾는다 — 더 긴 이름의 일부로만 남은 심볼은 사라진 것이다', async () => {
    const r = await findBrokenCodeCoordinates(root, [
      concept({ sources: [code('src/render.ts', 'save()의 저장 흐름')] as never }),
    ]);
    expect(r).toEqual([expect.objectContaining({ problem: 'missing-symbol', detail: ['save'] })]);
  });
  it('심볼과 줄 범위가 함께 어긋나면 둘 다 알린다', async () => {
    const r = await findBrokenCodeCoordinates(root, [
      concept({ sources: [code('src/render.ts', 'renderGone() (40~50행)')] as never }),
    ]);
    expect(r).toEqual([
      expect.objectContaining({ problem: 'missing-symbol', detail: ['renderGone'] }),
      expect.objectContaining({ problem: 'line-out-of-range', detail: ['50 > 3'] }),
    ]);
  });
  it('설명 속 약어·제품명만 있는 자리는 깨졌다고 알리지 않는다', async () => {
    const r = await findBrokenCodeCoordinates(root, [
      concept({
        sources: [
          code('src/render.ts', 'renderViewer()의 CSRF 방어부, GitHub 연동 (L2-L3)'),
        ] as never,
      }),
    ]);
    expect(r).toEqual([]);
  });
  it('줄 범위가 파일 길이를 넘으면 알린다 [규칙: 줄 범위가 실재하는지 확인한다]', async () => {
    const r = await findBrokenCodeCoordinates(root, [
      concept({ sources: [code('src/render.ts', '조립부 (186~203행)')] as never }),
    ]);
    expect(r).toEqual([expect.objectContaining({ problem: 'line-out-of-range' })]);
  });
  it('실재하는 자리와 설명 문장만 있는 자리는 알리지 않는다', async () => {
    const r = await findBrokenCodeCoordinates(root, [
      concept({
        codeLinks: ['src/render.ts', 'src'],
        sources: [
          code('src/render.ts', 'renderViewer()의 saveBtn 핸들러 (2~3행)'),
          code('src/render.ts', '저장 버튼을 누를 때의 흐름'),
        ] as never,
      }),
    ]);
    expect(r).toEqual([]);
  });
  it('참고자료·사람의 결정 근거는 대상이 아니다 [규칙: 근거는 코드 준수 판정에 쓰이지 않는다]', async () => {
    const r = await findBrokenCodeCoordinates(root, [
      concept({
        sources: [
          { kind: 'reference', path: 'docs/nowhere.pdf', locator: 'p.3', supports: '' },
          { kind: 'decision', path: '', locator: '', supports: '사람의 판단' },
        ] as never,
      }),
    ]);
    expect(r).toEqual([]);
  });
});
