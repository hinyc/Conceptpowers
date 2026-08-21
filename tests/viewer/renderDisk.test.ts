// @concept:generated-not-hand-edited @concept:settled-status @concept:atomic-baseline-write @concept:feature-spec-bridge @concept:concept-code-mapping
// tests/viewer/renderDisk.test.ts
// 뷰어 생성물을 디스크에 쓰는 render를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - generated-not-hand-edited 구성요소 "생성물: 원본에서 자동으로 만들어지는 결과 — 뷰어 화면 파일,
//    배포용 실행 파일 같은 것" → 단일 SPA 에셋(index.html, viewer.js, serve.mjs, css)을 쓴다
//    → 개념마다 HTML 파일을 만들지 않는다 (본문은 원본 JSON에 두고 화면만 생성물이다)
//    → viewer.js와 index.html이 서로를 참조한다 / 렌더링된 CSS에 badge--pending 규칙이 들어간다
//  - concept-code-mapping 정의 "개념 하나가 어느 파일들에 구현돼 있는지는, 코드에 붙은 표식을 거꾸로
//    모아 알아낸다" → mapping.json이 개념→파일 엣지와 codeLinks로 반영된다
//  - feature-spec-bridge 불변 "개념과 코드의 연결은 기능 기록 한 곳에만 적고, 반대 방향은 그것에서
//    파생시킨다" → manifest.json에 개념·기능의 원본 JSON URL과 그래프가 담긴다
//  - settled-status 구성요소 "노랑(pending)" → 상태별 표시가 생성물 CSS에 함께 나간다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderViewerToDisk } from '../../src/viewer/render.js';
import { writeConcept } from '../../src/store/conceptStore.js';
import { writeFeature } from '../../src/store/featureStore.js';
import { writeMappingCache } from '../../src/mapping/scan.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
});

const viewer = (rel: string) => join(root, 'docs/conceptpowers/concepts/viewer', rel);

it('단일 SPA 에셋(index.html, viewer.js, serve.mjs, css)을 디스크에 쓴다', async () => {
  await renderViewerToDisk(root);
  expect(existsSync(viewer('index.html'))).toBe(true);
  expect(existsSync(viewer('assets/viewer.js'))).toBe(true);
  expect(existsSync(viewer('assets/sidebar.js'))).toBe(true);
  expect(existsSync(viewer('assets/topnav.js'))).toBe(true);
  expect(existsSync(viewer('serve.mjs'))).toBe(true);
  expect(existsSync(viewer('assets/concept.css'))).toBe(true);
});

it('개념마다 HTML 파일을 만들지 않는다', async () => {
  await writeConcept(root, {
    slug: 'admin-role',
    group: 'auth',
    category: ['role'],
    title: 'Admin Role',
    description: { definition: 'd' },
    purpose: { reason: 'r' },
    actions: {},
    principle: {},
  });
  await renderViewerToDisk(root);
  expect(existsSync(viewer('auth/admin-role.html'))).toBe(false);
});

it('manifest.json에 개념/기능의 원본 JSON URL과 그래프가 담긴다', async () => {
  await writeConcept(root, {
    slug: 'admin-role',
    group: 'auth',
    category: ['role'],
    title: 'Admin Role',
    description: { definition: 'd' },
    purpose: { reason: 'r' },
    actions: {},
    principle: {},
  });
  await writeFeature(root, {
    slug: 'login',
    title: 'Login',
    concepts: ['admin-role'],
    codePaths: ['src/a.ts'],
  });
  await renderViewerToDisk(root);
  const m = JSON.parse(readFileSync(viewer('manifest.json'), 'utf8'));
  expect(m.concepts[0].url).toBe('../data/auth/admin-role.json');
  expect(m.features[0].url).toBe('../../features/login.json');
  expect(m.graph.edges.some((e: { target: string }) => e.target === 'c:admin-role')).toBe(true);
});

it('mapping.json(@concept→코드)이 개념→파일 그래프 엣지와 codeLinks로 반영된다', async () => {
  await writeConcept(root, {
    slug: 'admin-role',
    group: 'auth',
    category: ['role'],
    title: 'Admin Role',
    description: { definition: 'd' },
    purpose: { reason: 'r' },
    actions: {},
    principle: {},
  });
  await writeMappingCache(root, { 'admin-role': ['src/admin.ts'] });
  await renderViewerToDisk(root);
  const m = JSON.parse(readFileSync(viewer('manifest.json'), 'utf8'));
  expect(m.concepts[0].codeLinks).toContain('src/admin.ts');
  expect(
    m.graph.edges.some(
      (e: { source: string; target: string; kind: string }) =>
        e.source === 'c:admin-role' && e.target === 'p:src/admin.ts' && e.kind === 'concept-file'
    )
  ).toBe(true);
});

it('렌더링된 CSS에 badge--pending 규칙이 포함된다', async () => {
  await renderViewerToDisk(root);
  const css = readFileSync(viewer('assets/concept.css'), 'utf8');
  expect(css).toContain('badge--pending');
});

it('viewer.js와 index.html이 서로를 참조한다', async () => {
  await renderViewerToDisk(root);
  expect(readFileSync(viewer('index.html'), 'utf8')).toContain('assets/viewer.js');
  expect(readFileSync(viewer('index.html'), 'utf8')).toContain('assets/sidebar.js');
  expect(readFileSync(viewer('index.html'), 'utf8')).toContain('assets/topnav.js');
});

it('렌더링된 CSS에 badge--pending 규칙이 포함된다', async () => {
  await renderViewerToDisk(root);
  const css = readFileSync(
    join(root, 'docs/conceptpowers/concepts/viewer/assets/concept.css'),
    'utf8'
  );
  expect(css).toContain('badge--pending');
});
