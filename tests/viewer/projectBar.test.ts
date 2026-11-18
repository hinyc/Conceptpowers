// @concept:viewer-readability @concept:viewer-navigation
// tests/viewer/projectBar.test.ts
// 모든 화면 최상단의 프로젝트 이름 띠(assets/viewer.js)를 node:vm + domStub으로 검증한다.
//  - 화면이 어느 것이든(setApp을 거치는 모든 화면) 이름 띠가 본문보다 먼저 온다
//  - 이름은 글자로만 들어가고(태그로 해석되지 않음) 전체 이름은 title로 볼 수 있다
//  - /api/health가 실패하거나 project가 없으면 띠 없이 기존처럼 그린다
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { makeDocument, byClass, type StubNode } from './domStub.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, '../../assets', f), 'utf8');
const viewerSrc = read('viewer.js').replace(/\nboot\(\);?\s*$/, '\n');
const css = read('concept.css');

const MANIFEST = {
  concepts: [{ slug: 'a-one', title: '첫째', group: 'alpha', category: [], status: 'green' }],
  features: [],
  graph: { edges: [] },
};

interface Ctx {
  state: { manifest: unknown; t: unknown; projectName: string | null };
  detectEditable(): Promise<void>;
  setApp(n: StubNode): void;
  viewIndex(): void;
  h(tag: string, attrs: unknown, ch?: unknown): StubNode;
  I18N: Record<string, unknown>;
}

function load(fetchImpl: () => Promise<unknown>) {
  const doc = makeDocument();
  const win = { localStorage: { getItem: () => null, setItem: () => {} }, location: { hash: '' } };
  const ctx: Record<string, unknown> = { window: win, document: doc, fetch: fetchImpl };
  vm.createContext(ctx);
  vm.runInContext(viewerSrc, ctx);
  vm.runInContext(read('topnav.js'), ctx);
  vm.runInContext(read('conceptDiff.js'), ctx);
  vm.runInContext(read('sidebar.js'), ctx);
  const c = ctx as unknown as Ctx;
  c.state.manifest = MANIFEST;
  c.state.t = c.I18N.ko;
  return { c, doc };
}

const healthOk = (project: unknown) => () =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ editable: true, project }) });

describe('프로젝트 이름 띠', () => {
  it('health의 project.name을 상태에 담고 화면 최상단에 그린다', async () => {
    const { c, doc } = load(healthOk({ id: 'abc', name: 'My Project' }));
    await c.detectEditable();
    expect(c.state.projectName).toBe('My Project');
    c.viewIndex();
    const first = doc.app.children[0];
    expect(first.getAttribute('class')).toBe('projectbar');
    expect(first.getAttribute('title')).toBe('My Project');
    expect(byClass(first, 'projectbar__name')[0].textContent).toBe('My Project');
  });

  it('어느 화면이든 setApp 첫 자식이 띠이고 본문이 그 뒤에 온다', async () => {
    const { c, doc } = load(healthOk({ id: 'abc', name: 'P' }));
    await c.detectEditable();
    const body = c.h('div', { class: 'wrap' }, 'body');
    c.setApp(body);
    expect(doc.app.children).toHaveLength(2);
    expect(doc.app.children[0].getAttribute('class')).toBe('projectbar');
    expect(doc.app.children[1]).toBe(body);
  });

  it('이름은 글자로만 들어간다(태그로 해석되지 않는다)', async () => {
    const evil = '<img src=x onerror=alert(1)>';
    const { c, doc } = load(healthOk({ id: 'abc', name: evil }));
    await c.detectEditable();
    c.setApp(c.h('div', null, 'x'));
    const name = byClass(doc.app, 'projectbar__name')[0];
    expect(name.children).toHaveLength(1);
    expect(name.children[0].tagName).toBe('#text');
    expect(name.textContent).toBe(evil);
  });

  it('health 요청이 실패하면 띠 없이 기존처럼 그린다', async () => {
    const { c, doc } = load(() => Promise.reject(new Error('static')));
    await c.detectEditable();
    expect(c.state.projectName).toBeNull();
    c.setApp(c.h('div', null, 'x'));
    expect(doc.app.children).toHaveLength(1);
    expect(byClass(doc.app, 'projectbar')).toHaveLength(0);
  });

  it('project가 없거나 이름이 비면 띠를 그리지 않는다', async () => {
    for (const project of [undefined, { id: 'a', name: '' }, { id: 'a', name: 7 }]) {
      const { c, doc } = load(healthOk(project));
      await c.detectEditable();
      c.setApp(c.h('div', null, 'x'));
      expect(byClass(doc.app, 'projectbar')).toHaveLength(0);
    }
  });

  it('ko/en 표에 문구가 있다', () => {
    const { c } = load(healthOk(undefined));
    for (const l of ['ko', 'en']) {
      expect(typeof (c.I18N[l] as Record<string, unknown>).projectBarLabel).toBe('string');
    }
  });

  it('긴 이름은 줄임 처리하고 띠는 라이트·다크 공통 글자색 토큰을 쓴다', () => {
    expect(css).toMatch(/\.projectbar__name\s*{[^}]*text-overflow:\s*ellipsis/);
    expect(css).toMatch(/\.projectbar\s*{[^}]*color:\s*var\(--fg\)/);
    expect(css).toMatch(/\.projectbar\s*{[^}]*background:\s*var\(--surface\)/);
  });
});
