// @concept:copy-code-path
// tests/viewer/copyPath.test.ts
// 그래프 말풍선의 경로 복사 버튼(assets/viewer.js buildFileTip)을 node:vm + 최소 DOM 스텁으로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - copy-code-path 구성요소 "위치: 파일 점에 마우스를 올렸을 때 뜨는 말풍선 안, 경로 옆"
//    → 말풍선 안에 복사 버튼과 경로가 함께 들어가고, 버튼이 경로보다 앞에 놓인다
//  - copy-code-path 구성요소 "즉시 피드백: 성공하면 \"복사됨\", 실패하면 \"복사 실패\"로 글자가 바뀐다"
//    + 불변 "복사 성공과 실패를 모두 사용자에게 즉시 보여준다 — 조용히 실패하지 않는다"
//    → 성공하면 버튼 글자가 "복사됨" / 실패하면 "복사 실패" / 잠시 뒤 원래 글자로 돌아온다
//  - copy-code-path 정의 "지식 그래프에서 파일 경로를 클릭 한 번으로 클립보드에 담는다"
//    → 클립보드에 담기는 값은 말풍선에 보이는 그 경로다
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../../assets/viewer.js'), 'utf8').replace(
  /\nboot\(\);?\s*$/,
  '\n'
);

interface Stub {
  tagName: string;
  className: string;
  type: string;
  textContent: string;
  style: Record<string, string>;
  children: Stub[];
  parentNode: Stub | null;
  listeners: Record<string, Array<() => void>>;
  appendChild(c: Stub): Stub;
  addEventListener(k: string, fn: () => void): void;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
}

function el(tag = 'div'): Stub {
  return {
    tagName: tag,
    className: '',
    type: '',
    textContent: '',
    style: {},
    children: [],
    parentNode: null,
    listeners: {},
    appendChild(c) {
      c.parentNode = this;
      this.children.push(c);
      return c;
    },
    addEventListener(k, fn) {
      (this.listeners[k] = this.listeners[k] || []).push(fn);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  };
}

function load(clipboard: { writeText: (s: string) => Promise<void> }) {
  const body = el('body');
  const ctx: Record<string, unknown> = {
    window: {},
    navigator: { clipboard },
    document: {
      createElement: (t: string) => el(t),
      createElementNS: (_ns: string, t: string) => el(t),
      createTextNode: (s: string) => Object.assign(el('#text'), { textContent: s }),
      body,
    },
    setTimeout,
    clearTimeout,
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const state = ctx.state as { t: unknown };
  state.t = (ctx.I18N as Record<string, unknown>).ko;
  return ctx as unknown as {
    buildFileTip: (
      svg: Stub,
      getView: () => { x: number; y: number; w: number; h: number }
    ) => { show: (d: { title: string; x: number; y: number }) => void };
    I18N: { ko: { copyPath: string; copied: string; copyFailed: string } };
  };
}

function makeTip(clipboard: { writeText: (s: string) => Promise<void> }) {
  const ctx = load(clipboard);
  const svg = el('svg');
  const host = el('div');
  host.appendChild(svg);
  const tip = ctx.buildFileTip(svg, () => ({ x: 0, y: 0, w: 100, h: 100 }));
  // buildFileTip이 svg.parentNode에 붙인 말풍선
  const bubble = host.children[host.children.length - 1];
  const btn = bubble.children.find((c) => c.tagName === 'button') as Stub;
  const path = bubble.children.find((c) => c.className === 'gtip__path') as Stub;
  return { ctx, tip, bubble, btn, path };
}

describe('buildFileTip — 경로 복사 버튼', () => {
  it('말풍선 안에 복사 버튼과 경로를 함께 두고, 버튼이 경로보다 앞에 온다', () => {
    const { bubble, btn, path } = makeTip({ writeText: () => Promise.resolve() });
    expect(bubble.className).toBe('gtip');
    expect(btn).toBeDefined();
    expect(path).toBeDefined();
    expect(bubble.children.indexOf(btn)).toBeLessThan(bubble.children.indexOf(path));
  });

  it('말풍선에 보이는 그 경로를 클립보드에 담는다', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const { tip, btn } = makeTip({ writeText });
    tip.show({ title: 'src/audit/gaps.ts', x: 10, y: 10 });
    btn.listeners.click[0]();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('src/audit/gaps.ts');
  });

  it('복사가 되면 버튼 글자로 성공을 바로 알린다', async () => {
    const { ctx, tip, btn } = makeTip({ writeText: () => Promise.resolve() });
    tip.show({ title: 'a/b.ts', x: 0, y: 0 });
    expect(btn.textContent).toBe(ctx.I18N.ko.copyPath);
    btn.listeners.click[0]();
    await new Promise((r) => setTimeout(r, 0));
    expect(btn.textContent).toBe(ctx.I18N.ko.copied);
  });

  it('복사가 안 되면 조용히 넘어가지 않고 실패를 알린다', async () => {
    const { ctx, tip, btn } = makeTip({ writeText: () => Promise.reject(new Error('denied')) });
    tip.show({ title: 'a/b.ts', x: 0, y: 0 });
    btn.listeners.click[0]();
    await new Promise((r) => setTimeout(r, 0));
    expect(btn.textContent).toBe(ctx.I18N.ko.copyFailed);
  });

  it('알린 뒤에는 원래 글자로 돌아와 다음 복사를 받을 수 있다', async () => {
    vi.useFakeTimers();
    try {
      const { ctx, tip, btn } = makeTip({ writeText: () => Promise.resolve() });
      tip.show({ title: 'a/b.ts', x: 0, y: 0 });
      btn.listeners.click[0]();
      await vi.advanceTimersByTimeAsync(0);
      expect(btn.textContent).toBe(ctx.I18N.ko.copied);
      await vi.advanceTimersByTimeAsync(1300);
      expect(btn.textContent).toBe(ctx.I18N.ko.copyPath);
    } finally {
      vi.useRealTimers();
    }
  });
});
