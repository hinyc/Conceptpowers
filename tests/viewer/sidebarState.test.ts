// @concept:sidebar-toggle @concept:sidebar-search @concept:output-locale
// tests/viewer/sidebarState.test.ts
// CPSidebar.isOpen/setOpen(assets/sidebar.js)을 node:vm으로 로드해 검증한다.
// 순수 상태 판단(localStorage + width)만 하므로 DOM 없이 스텁으로 평가 가능.
// (동일 패턴: tests/viewer/subgraph.test.ts)
// 검증 대상 규칙 ↔ 시나리오:
//  - sidebar-toggle 허용 "사람이 아무 선택도 한 적 없을 때만 기본값(열림)을 쓰는 것"
//    → 아무 선택도 한 적 없으면 기본 열림이다 (곁 목록은 넓은 화면 전용이라 너비는 보지 않는다)
//  - sidebar-toggle 불변 "저장된 선택이 있으면 기본값보다 그 선택을 우선한다"
//    → 사용자가 닫으면 닫힘을 기억해 유지한다 / 닫았다가 다시 열면 열림을 기억해 유지한다
//  - sidebar-toggle 불변 "저장은 사람이 직접 조작했을 때만 한다 — 화면 크기 변화로는 저장하지 않는다"
//    → 저장 경로를 타는 것은 setOpen(사람의 조작)뿐이다
//  - sidebar-search 정의 "상세 화면 곁 목록의 검색창은 새로 찾아오지 않고, 이미 떠 있는 것 중에서
//    안 맞는 것을 숨긴다" → matchesQuery: 빈 검색어는 항상 true / 대소문자 무시 부분일치 /
//    앞뒤 공백 무시 / text가 없어도 예외 없이 false
//  - output-locale 불변 "사람이 읽을 산출물은 프로젝트에 설정된 언어로 쓴다"
//    → ko/en 번역에 sidebarSearchPh 키가 있다
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
  return ctx.CPSidebar as {
    isOpen: () => boolean;
    setOpen: (open: boolean) => void;
    matchesQuery: (text: string | null, q: string) => boolean;
  };
}

describe('CPSidebar 열림 상태 (sidebar-toggle: 기본 열림, 저장된 선택 우선)', () => {
  it('아무 선택도 한 적 없으면 기본 열림이다 — 곁 목록은 넓은 화면 전용이라 너비는 보지 않는다', () => {
    expect(loadSidebar(1280).isOpen()).toBe(true);
    expect(loadSidebar(320).isOpen()).toBe(true);
  });

  it('사용자가 닫으면 닫힘 상태를 기억해 유지한다 (규칙: 저장된 선택이 기본값보다 우선)', () => {
    const sidebar = loadSidebar(1920);
    sidebar.setOpen(false);
    expect(sidebar.isOpen()).toBe(false);
  });

  it('닫았다가 다시 열면 열림 상태를 기억해 유지한다', () => {
    const sidebar = loadSidebar(1920);
    sidebar.setOpen(false);
    sidebar.setOpen(true);
    expect(sidebar.isOpen()).toBe(true);
  });
});

describe('사이드바 검색 i18n', () => {
  it('ko/en 번역에 sidebarSearchPh 키가 있다', () => {
    const ctx: Record<string, unknown> = {
      window: { innerWidth: 1280, localStorage: makeLocalStorage() },
      document: {},
    };
    vm.createContext(ctx);
    vm.runInContext(viewerSrc, ctx);
    const i18n = ctx.I18N as { ko: Record<string, string>; en: Record<string, string> };
    expect(i18n.ko.sidebarSearchPh).toBeTruthy();
    expect(i18n.en.sidebarSearchPh).toBeTruthy();
  });
});

describe('CPSidebar.matchesQuery', () => {
  it('빈 검색어는 항상 true', () => {
    expect(loadSidebar(1280).matchesQuery('아무 텍스트', '')).toBe(true);
    expect(loadSidebar(1280).matchesQuery('아무 텍스트', '   ')).toBe(true);
  });

  it('대소문자 무시 부분일치', () => {
    const sidebar = loadSidebar(1280);
    expect(sidebar.matchesQuery('Auth Flow', 'auth')).toBe(true);
    expect(sidebar.matchesQuery('Auth Flow', 'FLOW')).toBe(true);
    expect(sidebar.matchesQuery('Auth Flow', 'zzz')).toBe(false);
  });

  it('앞뒤 공백은 무시한다', () => {
    expect(loadSidebar(1280).matchesQuery('Payment', '  pay  ')).toBe(true);
  });

  it('text가 없어도 예외 없이 false를 반환한다', () => {
    expect(loadSidebar(1280).matchesQuery(null, 'x')).toBe(false);
  });
});
