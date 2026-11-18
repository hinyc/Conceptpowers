// @concept:pending-diff @concept:viewer-readability @concept:concept-inline-edit
// tests/viewer/pendingDiffView.test.ts
// 개념 상세의 "승인본과 달라진 점" 칸(assets/viewer.js pendingDiffSection)을 node:vm + DOM 스텁으로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - pending-diff 불변 "검토 중인 개념에만 나타난다" → green/red에는 칸도 요청도 없다
//  - pending-diff 불변 "추가·삭제·수정은 색 없이도 글자로 구분된다" → 글자 표시(추가/삭제/수정, 영어 Added/Removed/Changed),
//    종류별 배경 음영 클래스(diff-text--added/removed/before/after), 수정은 전·후를 나란히
//  - pending-diff 불변 "승인본이 없으면 비교할 승인본이 없다고 알린다" → approved:null 안내
//  - pending-diff 불변 "비교할 수 없으면 이유를 알리고, 달라진 것이 없다고 말하지 않는다"
//    → 500·네트워크 오류·정적 배포(서버 없음)·깨진 응답은 불러올 수 없음 안내이며 "내용이 같습니다"는 절대 나오지 않는다
//    → "내용이 같습니다"는 승인본이 있고 차이가 0건일 때뿐이다
//  - pending-diff 제한 "비교하면서 개념 내용이나 상태를 바꾸는 것" → GET 요청만 보낸다(쓰기 메서드 없음)
//  - 뒤늦게 도착한 응답이 다른 개념 화면에 그려지지 않는다 / 다시 그릴 때마다 새 비교를 요청한다
//  - 내용은 글자로만 넣는다(innerHTML 금지)
//  - viewer-readability 불변(색 외 단서): CSS에서 삭제는 취소선, 수정 전/후는 서로 다른 밑줄, 라이트/다크 글자 대비 4.5:1 이상
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { makeDocument, byClass, type StubNode } from './domStub.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (n: string) => readFileSync(join(here, '../../assets', n), 'utf8');
const viewerSrc = read('viewer.js').replace(/\nboot\(\);?\s*$/, '\n');

const MANIFEST = {
  concepts: [
    { slug: 'p-one', title: 'P1', group: 'g', category: [], status: 'pending' },
    { slug: 'p-two', title: 'P2', group: 'g', category: [], status: 'pending' },
    { slug: 'g-one', title: 'G1', group: 'g', category: [], status: 'green' },
    { slug: 'r-one', title: 'R1', group: 'g', category: [], status: 'red' },
  ],
  features: [],
  graph: { edges: [] },
};

const concept = (slug: string, status: string, extra: Record<string, unknown> = {}) => ({
  slug,
  group: 'g',
  category: ['feature'],
  status,
  title: slug.toUpperCase(),
  aliases: [],
  description: { definition: '정의', components: [] },
  purpose: { reason: '이유', benefits: [] },
  actions: { allow: [], restrict: [] },
  principle: { immutableRules: [], operationalPrinciple: '', tradeoffs: '', lifecycle: [] },
  relations: { prev: '', next: '', related: [] },
  codeLinks: [],
  sources: [],
  ...extra,
});

type Reply = { ok: boolean; status: number; json: () => Promise<unknown> } | 'throw';

function setup(opts: { editable?: boolean; locale?: 'ko' | 'en' } = {}) {
  const calls: Array<{ url: string; init?: { method?: string } }> = [];
  const pending: Array<(r: Reply) => void> = [];
  const doc = makeDocument();
  const ctx: Record<string, unknown> = {
    window: { localStorage: { getItem: () => null, setItem: () => {} } },
    document: doc,
    fetch: (url: string, init?: { method?: string }) => {
      calls.push({ url, init });
      return new Promise((resolve, reject) => {
        pending.push((r) => (r === 'throw' ? reject(new Error('net')) : resolve(r)));
      });
    },
  };
  vm.createContext(ctx);
  vm.runInContext(read('conceptDiff.js'), ctx);
  vm.runInContext(viewerSrc, ctx);
  vm.runInContext(read('topnav.js'), ctx);
  vm.runInContext(read('sidebar.js'), ctx);
  const c = ctx as unknown as {
    state: { manifest: unknown; t: unknown; editable: boolean; current: unknown };
    renderConcept(slug: string): void;
  };
  c.state.manifest = MANIFEST;
  c.state.t = (ctx.I18N as Record<string, unknown>)[opts.locale ?? 'ko'];
  c.state.editable = opts.editable ?? true;
  const show = (slug: string, cur: unknown) => {
    c.state.current = cur;
    c.renderConcept(slug);
  };
  const box = () => byClass(doc.app as unknown as StubNode, 'diff-box')[0];
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { calls, pending, show, box, flush, doc, c };
}

const json = (body: unknown, status = 200): Reply => ({
  ok: status < 400,
  status,
  json: async () => body,
});

describe('승인본과 달라진 점 칸 — 나타나는 때', () => {
  it('green·red 개념에는 칸도 요청도 없다', () => {
    const s = setup();
    s.show('g-one', concept('g-one', 'green'));
    expect(s.box()).toBeUndefined();
    s.show('r-one', concept('r-one', 'red'));
    expect(s.box()).toBeUndefined();
    expect(s.calls).toHaveLength(0);
  });

  it('pending 개념은 칸을 펼친 채 놓고 GET으로만 승인본을 요청한다', () => {
    const s = setup();
    s.show('p-one', concept('p-one', 'pending'));
    expect(s.box()).toBeDefined();
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].url).toBe('/api/concept/p-one/approved');
    expect(s.calls[0].init?.method ?? 'GET').toBe('GET');
  });

  it('다시 그릴 때마다(저장 뒤 재렌더) 새 비교를 요청한다', () => {
    const s = setup();
    s.show('p-one', concept('p-one', 'pending'));
    s.show('p-one', concept('p-one', 'pending', { title: '고침' }));
    expect(s.calls).toHaveLength(2);
  });
});

describe('안내 분기 — 달라진 것이 없다고 말하면 안 되는 경우', () => {
  async function answer(reply: Reply, opts = {}) {
    const s = setup(opts);
    s.show('p-one', concept('p-one', 'pending'));
    s.pending[0](reply);
    await s.flush();
    await s.flush();
    return s.box().textContent;
  }
  const t = () => (setup().c as unknown as { state: { t: Record<string, string> } }).state.t;

  it('승인본 없음(approved:null) → 비교할 승인본이 없다는 안내', async () => {
    const text = await answer(json({ approved: null }));
    expect(text).toContain(
      '비교할 승인본이 없습니다. 처음 작성 중이거나 이 기능이 생기기 전에 수정된 개념입니다.'
    );
    expect(text).not.toContain(t().diffSame);
  });

  it('500 → 불러올 수 없음 + 파일을 읽을 수 없다는 이유, 같다는 말은 없다', async () => {
    const text = await answer(json({ error: 'x' }, 500));
    expect(text).toContain('지금은 승인본을 불러올 수 없어 비교하지 못했습니다.');
    expect(text).toContain(t().diffReasonUnreadable);
    expect(text).not.toContain(t().diffSame);
  });

  it('네트워크 오류 → 불러올 수 없음 + 서버 연결 이유', async () => {
    const text = await answer('throw');
    expect(text).toContain(t().diffUnavailable);
    expect(text).toContain(t().diffReasonServer);
    expect(text).not.toContain(t().diffSame);
  });

  it('깨진 응답(JSON 아님/모양 다름) → 불러올 수 없음', async () => {
    const broken: Reply = {
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json');
      },
    };
    expect(await answer(broken)).toContain(t().diffUnavailable);
    expect(await answer(json({ approved: 'x' }))).toContain(t().diffUnavailable);
    expect(await answer(json({}))).toContain(t().diffUnavailable);
  });

  it('정적 배포(편집 서버 없음) → 요청 없이 불러올 수 없음 안내', () => {
    const s = setup({ editable: false });
    s.show('p-one', concept('p-one', 'pending'));
    expect(s.calls).toHaveLength(0);
    expect(s.box().textContent).toContain(t().diffUnavailable);
    expect(s.box().textContent).not.toContain(t().diffSame);
  });

  it('승인본이 있고 차이가 0건일 때만 "승인본과 내용이 같습니다."', async () => {
    const text = await answer(
      json({
        approved: { savedAt: '2026-11-18T01:00:00.000Z', concept: concept('p-one', 'green') },
      })
    );
    expect(text).toContain('승인본과 내용이 같습니다.');
  });
});

describe('달라진 점 표시 — 글자 표시·전후·음영 클래스', () => {
  const approved = concept('p-one', 'green', {
    title: '옛 제목',
    actions: { allow: ['지울 것', '그대로'], restrict: [] },
    principle: {
      immutableRules: ['규칙 하나', '규칙 둘'],
      operationalPrinciple: '',
      tradeoffs: '',
      lifecycle: [],
    },
  });
  const current = concept('p-one', 'pending', {
    title: '새 제목 <b>x</b>',
    actions: { allow: ['그대로'], restrict: ['새 금지'] },
    principle: {
      immutableRules: ['규칙 둘', '규칙 하나'],
      operationalPrinciple: '',
      tradeoffs: '',
      lifecycle: [],
    },
  });

  async function render(locale: 'ko' | 'en') {
    const s = setup({ locale });
    s.show('p-one', current);
    s.pending[0](json({ approved: { savedAt: '2026-11-18T01:00:00.000Z', concept: approved } }));
    await s.flush();
    await s.flush();
    return s;
  }

  it('추가·삭제·수정이 각각 글자 표시와 배경 음영 클래스를 갖는다 (ko)', async () => {
    const box = (await render('ko')).box();
    const tags = byClass(box, 'diff-tag').map((n) => n.textContent);
    expect(tags).toContain('추가');
    expect(tags).toContain('삭제');
    expect(tags).toContain('수정');
    expect(byClass(box, 'diff-text--added').length).toBeGreaterThan(0);
    expect(byClass(box, 'diff-text--removed').length).toBeGreaterThan(0);
    expect(byClass(box, 'diff-text--before').length).toBeGreaterThan(0);
    expect(byClass(box, 'diff-text--after').length).toBeGreaterThan(0);
    // 삭제는 취소선이 걸리는 del 요소, 추가는 ins 요소
    expect(byClass(box, 'diff-text--removed')[0].tagName).toBe('del');
    expect(byClass(box, 'diff-text--added')[0].tagName).toBe('ins');
  });

  it('영어 locale은 Added/Removed/Changed', async () => {
    const tags = byClass((await render('en')).box(), 'diff-tag').map((n) => n.textContent);
    expect(tags).toEqual(expect.arrayContaining(['Added', 'Removed', 'Changed']));
  });

  it('수정은 전과 후를 나란히 보여 주고, 순서만 바뀐 칸은 순서 변경 표시가 붙는다', async () => {
    const box = (await render('ko')).box();
    const pairs = byClass(box, 'diff-pair');
    const titlePair = pairs.find((p) => p.textContent.includes('옛 제목'))!;
    expect(byClass(titlePair, 'diff-side--before')[0].textContent).toContain('옛 제목');
    expect(byClass(titlePair, 'diff-side--after')[0].textContent).toContain('새 제목');
    const reorder = byClass(box, 'diff-note').map((n) => n.textContent);
    expect(reorder).toContain('순서 변경');
  });

  it('목록 칸에서 문장을 고친 항목도 수정으로 전·후가 나란히 보인다', async () => {
    const s = setup();
    const before = concept('p-one', 'green', {
      actions: { allow: [], restrict: ['개념이 아닌 기능·파일 경로까지 찾아오는 것'] },
    });
    const after = concept('p-one', 'pending', {
      actions: { allow: [], restrict: ['개념이 아닌 기능·파일 경로까지 데려오는 것'] },
    });
    s.show('p-one', after);
    s.pending[0](json({ approved: { savedAt: '2026-11-18T01:00:00.000Z', concept: before } }));
    await s.flush();
    await s.flush();
    const box = s.box();
    expect(byClass(box, 'diff-tag').map((n) => n.textContent)).toEqual(['수정']);
    const pair = byClass(box, 'diff-pair')[0];
    expect(byClass(pair, 'diff-side--before')[0].textContent).toContain('찾아오는 것');
    expect(byClass(pair, 'diff-side--after')[0].textContent).toContain('데려오는 것');
    expect(box.textContent).toContain('추가 0건 · 삭제 0건 · 수정 1건');
  });

  it('승인본 저장 시각과 변경 개수 요약을 보여 준다', async () => {
    const text = (await render('ko')).box().textContent;
    expect(text).toContain('승인본 저장');
    expect(text).toContain('추가 1건 · 삭제 1건 · 수정 2건');
  });

  it('내용은 글자로만 들어간다 — 태그 문자열이 그대로 글자로 보인다', async () => {
    const box = (await render('ko')).box();
    expect(box.textContent).toContain('<b>x</b>');
    expect(byClass(box, 'diff-text').every((n) => n.tagName !== 'b')).toBe(true);
    const src = read('viewer.js');
    const section = src.slice(src.indexOf('---- 승인본과 달라진 점'), src.indexOf('// 읽기 모드.'));
    expect(section.length).toBeGreaterThan(500);
    expect(section).not.toMatch(/innerHTML|insertAdjacentHTML/);
    expect(read('conceptDiff.js')).not.toMatch(/innerHTML|insertAdjacentHTML/);
  });
});

describe('뒤늦게 도착한 응답', () => {
  it('다른 개념으로 넘어간 뒤 도착한 이전 개념의 응답은 그려지지 않는다', async () => {
    const s = setup();
    s.show('p-one', concept('p-one', 'pending'));
    const firstBox = s.box();
    s.show('p-two', concept('p-two', 'pending'));
    const secondBox = s.box();
    expect(secondBox).not.toBe(firstBox);
    // 이전 개념(0번) 응답이 나중에 도착
    s.pending[1](json({ approved: null }));
    s.pending[0](
      json({
        approved: { savedAt: '2026-11-18T01:00:00.000Z', concept: concept('p-one', 'green') },
      })
    );
    await s.flush();
    await s.flush();
    expect(firstBox.textContent).toContain('비교하는 중');
    expect(secondBox.textContent).toContain('비교할 승인본이 없습니다');
    expect(secondBox.textContent).not.toContain('내용이 같습니다');
  });

  it('green 개념으로 넘어간 뒤 도착한 pending 응답도 버려진다', async () => {
    const s = setup();
    s.show('p-one', concept('p-one', 'pending'));
    const stale = s.box();
    s.show('g-one', concept('g-one', 'green'));
    s.pending[0](json({ approved: null }));
    await s.flush();
    await s.flush();
    expect(stale.textContent).toContain('비교하는 중');
    expect(s.box()).toBeUndefined();
  });
});

describe('음영 색 (viewer-readability: 색 외 단서 + 4.5:1)', () => {
  const css = read('concept.css');
  const rootBlock = css.slice(
    css.indexOf(':root {'),
    css.indexOf('@media (prefers-color-scheme: dark)')
  );
  const darkBlock = css.slice(
    css.indexOf('@media (prefers-color-scheme: dark)'),
    css.indexOf('* {')
  );
  const token = (block: string, name: string) =>
    new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block)![1];
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  for (const [theme, block] of [
    ['라이트', rootBlock],
    ['다크', darkBlock],
  ] as const) {
    it(`${theme}: 네 음영 모두 글자색 대비 4.5:1 이상이고 서로 다른 색이다`, () => {
      const fg = token(block, 'fg');
      const bgs = ['diff-add-bg', 'diff-rem-bg', 'diff-before-bg', 'diff-after-bg'].map((n) =>
        token(block, n)
      );
      for (const bg of bgs) expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      expect(new Set(bgs).size).toBe(4);
    });
  }

  it('삭제는 취소선, 수정 전/후는 서로 다른 밑줄로 색 외 단서를 준다', () => {
    expect(css).toMatch(/\.diff-text--removed\s*{[^}]*line-through/);
    expect(css).toMatch(/\.diff-text--before\s*{[^}]*underline dotted/);
    expect(css).toMatch(/\.diff-text--after\s*{[^}]*underline solid/);
  });
});
