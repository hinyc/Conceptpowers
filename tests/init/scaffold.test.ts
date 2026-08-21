// @concept:init-gate @concept:output-locale @concept:concept-driven-tests @concept:generated-not-hand-edited @concept:reference-privacy
// tests/init/scaffold.test.ts
// 초기화 스캐폴드(scaffoldInit)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - init-gate 구성요소 "초기화 표시: 프로젝트에 개념 관리를 시작했음을 나타내는 표시"
//    → 5요소 폴더와 init.json을 만든다 / isInitialized가 마커 존재를 감지한다
//    → init.json에 backfillMode를 기록한다
//  - human-owns-contract 불변 "개념 문서의 내용 변경은 반드시 사람의 확인을 거친다"
//    → 이미 초기화된 경우 init.json을 덮어쓰지 않는다 / 재실행 시 baseline을 보존한다
//  - output-locale 불변 "사람이 읽을 산출물은 프로젝트에 설정된 언어로 쓴다"
//    → init.json에 locale을 기록한다(기본 ko) / ko seed는 한글로, en seed는 영어로 작성된다
//  - concept-driven-tests 구성요소 "스위치: 시작 설정 파일의 참/거짓 값 하나 — 값이 없으면 켜진 것으로
//    보고, 거짓으로 적었을 때만 꺼진다" → 새 init.json에 conceptDrivenTests: true를 기록한다
//  - generated-not-hand-edited 구성요소 "생성물: … 뷰어 화면 파일 …"
//    → init 시 빈 상태 뷰어(index.html + viewer.js + serve.mjs + css + manifest)를 미리 생성한다
//    → 재실행 시 옛 포맷 고아 *.html을 정리한다
//  - reference-privacy 구성요소 "안내용 파일: … 도구가 이 폴더에 쓸 수 있는 유일한 것"
//    → reference 폴더와 안내 README를 생성한다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldInit, isInitialized } from '../../src/init/scaffold.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
});

describe('scaffoldInit', () => {
  it('5요소 폴더와 init.json을 만든다', async () => {
    await scaffoldInit(root, { backfillMode: 'incremental' });
    const b = join(root, 'docs/conceptpowers');
    for (const d of ['features', 'concepts/data', 'concepts/viewer', 'architecture', 'infra'])
      expect(existsSync(join(b, d))).toBe(true);
    expect(existsSync(join(b, 'init.json'))).toBe(true);
  });
  it('reference 폴더와 안내 README를 생성한다', async () => {
    await scaffoldInit(root, { locale: 'ko' });
    const ref = join(root, 'docs/conceptpowers/reference');
    expect(existsSync(ref)).toBe(true);
    expect(existsSync(join(ref, 'README.md'))).toBe(true);
    expect(readFileSync(join(ref, 'README.md'), 'utf8')).toContain('참고자료');
  });
  it('init.json에 backfillMode를 기록한다', async () => {
    await scaffoldInit(root, { backfillMode: 'strict' });
    const cfg = JSON.parse(readFileSync(join(root, 'docs/conceptpowers/init.json'), 'utf8'));
    expect(cfg.enabled).toBe(true);
    expect(cfg.backfillMode).toBe('strict');
  });
  // 규칙 검증: 새 init.json에 스위치가 명시돼 사용자가 파일만 봐도 끌 수 있다 (concept-driven-tests)
  it('새 init.json에 conceptDrivenTests: true를 기록한다', async () => {
    await scaffoldInit(root, {});
    const cfg = JSON.parse(readFileSync(join(root, 'docs/conceptpowers/init.json'), 'utf8'));
    expect(cfg.conceptDrivenTests).toBe(true);
  });
  it('isInitialized가 마커 존재를 감지한다', async () => {
    expect(await isInitialized(root)).toBe(false);
    await scaffoldInit(root, {});
    expect(await isInitialized(root)).toBe(true);
  });
  it('이미 초기화된 경우 init.json을 덮어쓰지 않는다', async () => {
    await scaffoldInit(root, { backfillMode: 'strict' });
    await scaffoldInit(root, { backfillMode: 'incremental' });
    const cfg = JSON.parse(readFileSync(join(root, 'docs/conceptpowers/init.json'), 'utf8'));
    expect(cfg.backfillMode).toBe('strict'); // 보존
  });
  it('재실행 시 옛 포맷 고아 *.html을 정리한다 (baseline 보존)', async () => {
    await scaffoldInit(root, {});
    const v = join(root, 'docs/conceptpowers/concepts/viewer');
    writeFileSync(join(v, 'graph.html'), '<old/>'); // 옛 잔재
    await scaffoldInit(root, {}); // 재실행 = 생성물 패치
    expect(existsSync(join(v, 'graph.html'))).toBe(false);
    expect(existsSync(join(v, 'index.html'))).toBe(true);
  });
  it('init.json에 locale을 기록한다 (기본 ko)', async () => {
    await scaffoldInit(root, {});
    const cfg = JSON.parse(readFileSync(join(root, 'docs/conceptpowers/init.json'), 'utf8'));
    expect(cfg.locale).toBe('ko');
  });
  it('ko seed 템플릿은 한글로 작성된다', async () => {
    await scaffoldInit(root, { locale: 'ko' });
    const b = join(root, 'docs/conceptpowers');
    expect(readFileSync(join(b, 'architecture/architecture.md'), 'utf8')).toContain('# 아키텍처');
    expect(readFileSync(join(b, 'infra/infra.md'), 'utf8')).toContain('# 인프라');
  });
  it('en seed 템플릿은 영어로 작성되고 locale을 기록한다', async () => {
    await scaffoldInit(root, { locale: 'en' });
    const b = join(root, 'docs/conceptpowers');
    expect(JSON.parse(readFileSync(join(b, 'init.json'), 'utf8')).locale).toBe('en');
    expect(readFileSync(join(b, 'architecture/architecture.md'), 'utf8')).toContain(
      '# Architecture'
    );
    expect(readFileSync(join(b, 'infra/infra.md'), 'utf8')).toContain('# Infrastructure');
  });
  it('init 시 빈 상태 뷰어(index.html + viewer.js + serve.mjs + css + manifest)를 미리 생성한다', async () => {
    await scaffoldInit(root, { locale: 'en' });
    const v = join(root, 'docs/conceptpowers/concepts/viewer');
    expect(existsSync(join(v, 'index.html'))).toBe(true);
    expect(existsSync(join(v, 'assets/viewer.js'))).toBe(true);
    expect(existsSync(join(v, 'serve.mjs'))).toBe(true);
    expect(existsSync(join(v, 'assets/concept.css'))).toBe(true);
    // locale은 정적 셸이 아니라 manifest.json에 기록되어 런타임에 반영된다.
    const manifest = JSON.parse(readFileSync(join(v, 'manifest.json'), 'utf8'));
    expect(manifest.locale).toBe('en');
  });
});
