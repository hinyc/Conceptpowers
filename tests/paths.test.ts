// @concept:init-gate @concept:concept-code-mapping @concept:reference-sync
// tests/paths.test.ts
// 도구가 프로젝트 안에서 쓰는 저장 위치(cpPaths)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - init-gate 구성요소 "초기화 표시" → init.json 경로가 docs/conceptpowers 아래에 정해져 있다
//  - concept-code-mapping 구성요소 "보관본" → 개념 데이터·뷰어·매핑 보관본 경로가 정해져 있다
//  - reference-sync 구성요소 "기준점: 참고자료마다 남긴 지문·크기·시각의 목록"
//    → 기준점 파일 경로가 정렬 기록 폴더(.alignment) 아래에 정해져 있다
import { describe, it, expect } from 'vitest';
import { cpPaths } from '../src/paths.js';

describe('cpPaths', () => {
  it('init.json 경로를 만든다', () => {
    expect(cpPaths('/proj').initFile).toBe('/proj/docs/conceptpowers/init.json');
  });
  it('개념 데이터/뷰어/캐시 경로를 만든다', () => {
    const p = cpPaths('/proj');
    expect(p.conceptsData).toBe('/proj/docs/conceptpowers/concepts/data');
    expect(p.conceptsViewer).toBe('/proj/docs/conceptpowers/concepts/viewer');
    expect(p.mappingCache).toBe('/proj/docs/conceptpowers/.cache/mapping.json');
  });
  it('참고자료 기준점 경로를 만든다', () => {
    expect(cpPaths('/proj').referenceLock).toBe(
      '/proj/docs/conceptpowers/concepts/.alignment/reference.lock.json'
    );
  });
});
