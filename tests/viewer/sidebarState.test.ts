// tests/viewer/sidebarState.test.ts
// CPSidebar.isOpen/setOpen(assets/sidebar.js)을 node:vm으로 로드해 검증한다.
// 순수 상태 판단(localStorage + width)만 하므로 DOM 없이 스텁으로 평가 가능.
// (동일 패턴: tests/viewer/subgraph.test.ts)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const viewerSrc = readFileSync(join(here, '../../assets/viewer.js'), 'utf8').replace(
  /\nboot\(\);?\s*$/,
  '\n'
);
const sidebarSrc = readFileSync(join(here, '../../assets/sidebar.js'), 'utf8');

function makeLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };
}

function loadSidebar(width: number) {
  const win: Record<string, unknown> = { innerWidth: width, localStorage: makeLocalStorage() };
  const ctx: Record<string, unknown> = { window: win, document: {} };
  vm.createContext(ctx);
  vm.runInContext(viewerSrc, ctx);
  vm.runInContext(sidebarSrc, ctx);
  return ctx.CPSidebar as { isOpen: () => boolean; setOpen: (open: boolean) => void };
}

describe('CPSidebar 열림 상태', () => {
  it('localStorage가 비어있고 폭이 1280 이상이면 기본 열림', () => {
    expect(loadSidebar(1280).isOpen()).toBe(true);
  });

  it('localStorage가 비어있고 폭이 1280 미만이면 기본 닫힘', () => {
    expect(loadSidebar(1279).isOpen()).toBe(false);
  });

  it('사용자가 닫으면 넓은 화면에서도 닫힘 상태를 유지한다', () => {
    const sidebar = loadSidebar(1920);
    sidebar.setOpen(false);
    expect(sidebar.isOpen()).toBe(false);
  });

  it('사용자가 열면 좁은 화면에서도 열림 상태를 유지한다', () => {
    const sidebar = loadSidebar(320);
    sidebar.setOpen(true);
    expect(sidebar.isOpen()).toBe(true);
  });
});
