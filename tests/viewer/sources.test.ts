// @concept:concept-provenance @concept:viewer-readability
// tests/viewer/sources.test.ts
// 뷰어의 근거(sources) 표시·편집 헬퍼(assets/viewer.js)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - concept-provenance 구성요소 "코드 자리 / 참고자료 좌표 / 사람의 결정"
//    → 한 줄 형식(kind | path | locator | supports)으로 왕복 변환된다(근거 → 줄, 줄 → 근거)
//  - concept-provenance 정의 "위치만 남기고 옮겨 적지 않는다"
//    → 표시 문구에는 kind·path·locator·supports만 들어가고 별도 원문 필드가 없다
//  - 상위 기준 문서(설계 C) "칸이 넷을 넘으면 나머지는 무시하고, 모자라면 빈 값으로 채운다"
//    → 칸이 모자란 줄은 빈 값으로 채우고, 넘치는 줄은 앞 네 칸만 쓴다
//  - 상위 기준 문서(설계 C) "kind가 셋 중 하나가 아닌 줄은 버린다"
//    → 알 수 없는 kind의 줄은 파싱 결과에서 제외된다
//  - viewer-readability 대응: I18N ko/en에 근거 라벨이 존재한다(다른 필드 라벨과 동일한 관례)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../../assets/viewer.js'), 'utf8').replace(
  /\nboot\(\);?\s*$/,
  '\n'
);

function load() {
  const ctx: Record<string, unknown> = { window: {}, document: { createElementNS() {}, createTextNode() {} } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx as Record<string, unknown> & {
    sourceToLine: (s: { kind: string; path?: string; locator?: string; supports?: string }) => string;
    lineToSource: (line: string) => { kind: string; path: string; locator: string; supports: string } | null;
    sourcesToLines: (sources: unknown[]) => string;
    linesToSources: (text: string) => unknown[];
    I18N: Record<string, Record<string, string>>;
  };
}

describe('sourceToLine / lineToSource — 왕복 변환', () => {
  it('code 근거를 한 줄로 만들고 다시 되돌린다', () => {
    const { sourceToLine, lineToSource } = load();
    const s = { kind: 'code', path: 'src/drift/hash.ts', locator: 'contractHash()', supports: '계약만 해시' };
    const line = sourceToLine(s);
    expect(lineToSource(line)).toEqual(s);
  });
  it('decision 근거는 path가 비어도 왕복된다', () => {
    const { sourceToLine, lineToSource } = load();
    const s = { kind: 'decision', path: '', locator: '2026-09-12', supports: '사람이 정함' };
    expect(lineToSource(sourceToLine(s))).toEqual(s);
  });
  it('칸이 모자라면 빈 값으로 채운다', () => {
    const { lineToSource } = load();
    expect(lineToSource('code | src/x.ts')).toEqual({
      kind: 'code',
      path: 'src/x.ts',
      locator: '',
      supports: '',
    });
  });
  it('칸이 넷을 넘으면 앞 네 칸만 쓴다', () => {
    const { lineToSource } = load();
    expect(lineToSource('code | src/x.ts | L1 | 설명 | 여분')).toEqual({
      kind: 'code',
      path: 'src/x.ts',
      locator: 'L1',
      supports: '설명',
    });
  });
  it('알 수 없는 kind의 줄은 버린다(null)', () => {
    const { lineToSource } = load();
    expect(lineToSource('guess | x | y | z')).toBeNull();
  });
});

describe('sourcesToLines / linesToSources — 텍스트에어리어 왕복', () => {
  it('근거 배열을 줄바꿈 텍스트로, 다시 배열로 되돌린다(잘못된 줄은 걸러진다)', () => {
    const { sourcesToLines, linesToSources } = load();
    const sources = [
      { kind: 'code', path: 'a.ts', locator: 'L1', supports: 'x' },
      { kind: 'reference', path: 'doc.md', locator: 'p.1', supports: 'y' },
    ];
    const text = sourcesToLines(sources);
    expect(linesToSources(text)).toEqual(sources);
    expect(linesToSources(text + '\nguess | bad')).toEqual(sources); // 잘못된 줄은 무시
  });
});

describe('I18N — 근거 라벨', () => {
  it('ko/en 모두 근거 라벨을 갖는다', () => {
    const { I18N } = load();
    expect(I18N.ko.sourcesLabel).toBeTruthy();
    expect(I18N.en.sourcesLabel).toBeTruthy();
  });
});
