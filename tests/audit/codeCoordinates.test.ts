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
