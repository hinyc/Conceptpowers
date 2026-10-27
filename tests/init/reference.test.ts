// @concept:reference-first-duty @concept:reference-privacy @concept:init-gate
// tests/init/reference.test.ts
// 참고자료 폴더 생성과 목록 읽기를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-privacy 구성요소 "안내용 파일: 폴더 사용법을 적은 안내문, 경로 목록, 비공개 설정 파일 —
//    도구가 이 폴더에 쓸 수 있는 유일한 것" → 폴더와 안내 README를 생성한다
//  - reference-privacy 불변 "도구가 폴더에 쓸 수 있는 것은 안내용 파일뿐이며, 그것도 아직 없을 때만
//    만든다" → 이미 README가 있으면 덮어쓰지 않는다 (사용자 편집 보존)
//  - reference-first-duty 구성요소 "읽는 곳: 참고자료 폴더 안의 파일과, 경로 목록에 등록된 바깥 위치"
//    → seed README는 제외하고 사용자 파일만 정렬해 반환한다 / 폴더가 없으면 빈 배열
//  - output-locale 불변 "사람이 읽을 산출물은 프로젝트에 설정된 언어로 쓴다" → en locale이면 영어 README
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureReference, listReferenceFiles } from '../../src/init/reference.js';
import { scaffoldInit } from '../../src/init/scaffold.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
});
const ref = (rel = '') => join(root, 'docs/conceptpowers/reference', rel);

describe('ensureReference', () => {
  it('폴더와 안내 README를 생성한다 (locale 반영)', async () => {
    await scaffoldInit(root, { locale: 'ko' });
    const created = await ensureReference(root);
    expect(created).toBe(false); // scaffoldInit가 이미 만들었음
    expect(existsSync(ref('README.md'))).toBe(true);
    expect(readFileSync(ref('README.md'), 'utf8')).toContain('참고자료');
  });
  it('en locale면 영어 README', async () => {
    await scaffoldInit(root, { locale: 'en' });
    expect(readFileSync(ref('README.md'), 'utf8')).toContain('Reference materials');
  });
  it('이미 README가 있으면 덮어쓰지 않는다 (사용자 편집 보존)', async () => {
    await scaffoldInit(root, {});
    writeFileSync(ref('README.md'), '내가 고친 내용');
    expect(await ensureReference(root)).toBe(false);
    expect(readFileSync(ref('README.md'), 'utf8')).toBe('내가 고친 내용');
  });
});

describe('listReferenceFiles', () => {
  it('seed README는 제외하고 사용자 파일만, 정렬해서 반환한다', async () => {
    await scaffoldInit(root, {});
    expect(await listReferenceFiles(root)).toEqual([]); // README만 있음
    writeFileSync(ref('glossary.md'), 'g');
    mkdirSync(ref('specs'), { recursive: true });
    writeFileSync(ref('specs/api.md'), 'a');
    const files = await listReferenceFiles(root);
    expect(files).toEqual(['glossary.md', join('specs', 'api.md')]);
  });
  it('폴더가 없으면 빈 배열', async () => {
    expect(await listReferenceFiles(root)).toEqual([]);
  });
  // reference-first-duty "읽는 곳: 참고자료 폴더 안의 파일" — 자료 판정과 지문 목록이 같은 건너뛰기 규칙을 쓴다.
  // 점 파일(.DS_Store 등)·점 폴더 안 파일·0바이트 파일은 자료가 아니라 "자료 있음" 오신호를 내지 않는다.
  it('점 파일·점 폴더·0바이트 파일은 자료로 치지 않는다', async () => {
    await scaffoldInit(root, {});
    writeFileSync(ref('.DS_Store'), 'x');
    mkdirSync(ref('.hidden'), { recursive: true });
    writeFileSync(ref('.hidden/secret.md'), 'x');
    writeFileSync(ref('empty.md'), '');
    writeFileSync(ref('real.md'), 'r');
    expect(await listReferenceFiles(root)).toEqual(['real.md']);
  });
  it('하위 폴더의 README.md·paths.md는 사용자 자료로 남긴다(메타 파일은 폴더 바로 아래만)', async () => {
    await scaffoldInit(root, {});
    mkdirSync(ref('specs'), { recursive: true });
    writeFileSync(ref('specs/README.md'), 'r');
    writeFileSync(ref('specs/paths.md'), 'p');
    expect(await listReferenceFiles(root)).toEqual([
      join('specs', 'README.md'),
      join('specs', 'paths.md'),
    ]);
  });
});
