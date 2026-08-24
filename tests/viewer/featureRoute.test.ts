// @concept:feature-index-row
// tests/viewer/featureRoute.test.ts
// 기능 주소 처리(assets/viewer.js의 route/featureRowHref/indexScrollTarget)를 node:vm으로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - feature-index-row 불변 "옛 기능 주소로 들어오면 빈 화면을 두지 않고 목록의 그 줄로 데려간다"
//    → #/feature/:slug는 색인 줄 주소로 자리바꿈(replace)하고, 히스토리에 남기지 않는다
//    → 자리바꿈 주소는 해시가 하나뿐이다 — '#'가 든 이름표도 인코딩돼 라우트가 읽을 수 있다
//    → 인코딩된 이름표는 색인 라우트에서 원래 이름표로 되돌아온다(왕복 대칭)
//    → 기능이 이미 삭제돼 그 줄이 없으면 기능 구역으로라도 데려간다 — 꼭대기에 떨구지 않는다
//  - feature-index-row 허용 "개념 화면에서 그 개념이 속한 기능을 눌러 목록의 그 줄로 돌아오는 것"
//    → 색인 줄 주소는 기능 묶음 아래 그 이름표를 가리킨다
//  - feature-index-row 불변 "기능 하나만 펼쳐 보는 전용 화면은 만들지 않는다 — 기능은 목록의 줄과 지식 그래프의 점으로만 나타난다"
//    → 기능 묶음이 아닌 묶음 주소(#/group/core/…)에서는 세 번째 조각을 초점으로 삼지 않는다
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

interface Ctx {
  route(): void;
  featureRowHref(slug: string): string;
  indexScrollTarget(scrollTo: string | null, focusFeature: string | null): unknown;
  viewIndex(scrollTo?: string, focusFeature?: string): void;
}

// hash만 갈아 끼우는 최소 window 스텁. replace 호출값을 그대로 받아 둔다.
// elements를 주면 document.getElementById가 그 맵에서 찾는다.
function load(hash: string, elements: Record<string, unknown> = {}) {
  const replaced: string[] = [];
  const assigned: string[] = [];
  const ctx: Record<string, unknown> = {
    window: {
      location: {
        hash,
        replace(url: string) {
          replaced.push(url);
        },
        assign(url: string) {
          assigned.push(url);
        },
      },
    },
    document: {
      getElementById(id: string) {
        return Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null;
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { ctx: ctx as unknown as Ctx, raw: ctx, replaced, assigned };
}

describe('기능 색인 줄 주소', () => {
  it('색인 줄 주소는 기능 묶음 아래 그 이름표를 가리킨다', () => {
    const { ctx } = load('#/');
    expect(ctx.featureRowHref('viewer-search')).toBe('#/group/__features/viewer-search');
  });

  it('이름표를 인코딩해 넣는다 — 라우트가 되읽을 수 있는 형태를 지킨다', () => {
    const { ctx } = load('#/');
    expect(ctx.featureRowHref('a b')).toBe('#/group/__features/a%20b');
    expect(ctx.featureRowHref('a#b')).toBe('#/group/__features/a%23b');
  });
});

describe('옛 기능 주소 (#/feature/:slug)', () => {
  it('빈 화면 대신 색인 줄로 데려간다', () => {
    const { ctx, replaced } = load('#/feature/viewer-search');
    ctx.route();
    expect(replaced).toEqual(['#/group/__features/viewer-search']);
  });

  it('자리바꿈 주소의 해시는 하나뿐이다 — "#"가 든 이름표도 인코딩된다', () => {
    const { ctx, replaced } = load('#/feature/' + encodeURIComponent('a#b'));
    ctx.route();
    expect(replaced).toEqual(['#/group/__features/a%23b']);
    expect(replaced[0].split('#')).toHaveLength(2);
  });

  it('되돌아갈 수 없게 자리바꿈으로만 이동한다(히스토리에 남기지 않는다)', () => {
    const { ctx, assigned } = load('#/feature/viewer-search');
    ctx.route();
    expect(assigned).toEqual([]);
  });

  it('인코딩된 이름표는 색인 라우트에서 원래 이름표로 되돌아온다(왕복 대칭)', () => {
    const { ctx, raw, replaced } = load('#/feature/' + encodeURIComponent('a b'));
    ctx.route();
    expect(replaced).toEqual(['#/group/__features/a%20b']);
    // 자리바꿈된 주소를 다시 라우트에 태우면 원래 이름표가 초점으로 전달된다.
    const calls: Array<[unknown, unknown]> = [];
    raw.viewIndex = (g: unknown, f: unknown) => calls.push([g, f]);
    (raw.window as { location: { hash: string } }).location.hash = replaced[0];
    ctx.route();
    expect(calls).toEqual([['__features', 'a b']]);
  });
});

describe('묶음 주소 (#/group/:g/:slug)', () => {
  it('초점 조각은 기능 묶음(__features)에서만 존중한다', () => {
    const { ctx, raw } = load('#/group/core/viewer-search');
    const calls: Array<[unknown, unknown]> = [];
    raw.viewIndex = (g: unknown, f: unknown) => calls.push([g, f]);
    ctx.route();
    expect(calls).toEqual([['core', null]]);
  });
});

describe('색인 스크롤 대상 (indexScrollTarget)', () => {
  it('초점 줄이 있으면 그 줄로 간다', () => {
    const row = { id: 'row' };
    const { ctx } = load('#/', { 'frow-viewer-search': row, 'g-__features': { id: 'sec' } });
    expect(ctx.indexScrollTarget(null, 'viewer-search')).toBe(row);
  });

  it('기능이 삭제돼 줄이 없으면 기능 구역으로 데려간다 — 꼭대기에 떨구지 않는다', () => {
    const section = { id: 'sec' };
    const { ctx } = load('#/', { 'g-__features': section });
    expect(ctx.indexScrollTarget(null, 'gone-feature')).toBe(section);
  });

  it('초점이 없으면 묶음 제목으로 간다', () => {
    const section = { id: 'core' };
    const { ctx } = load('#/', { 'g-core': section });
    expect(ctx.indexScrollTarget('core', null)).toBe(section);
  });
});
