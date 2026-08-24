// @concept:feature-index-row
// tests/viewer/featureRoute.test.ts
// 기능 주소 처리(assets/viewer.js의 route/featureRowHref)를 node:vm으로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - feature-index-row 불변 "옛 기능 주소로 들어오면 빈 화면을 두지 않고 목록의 그 줄로 데려간다"
//    → #/feature/:slug는 색인 줄 주소로 자리바꿈(replace)하고, 히스토리에 남기지 않는다
//    → 자리바꿈 주소는 해시가 하나뿐이다(이중 해시가 되면 라우트가 못 읽는다)
//    → 이름표에 특수문자가 있어도 원래 이름표로 되돌려 보낸다
//  - feature-index-row 허용 "개념 화면에서 그 개념이 속한 기능을 눌러 목록의 그 줄로 돌아오는 것"
//    → 색인 줄 주소는 기능 묶음 아래 그 이름표를 가리킨다
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
}

// hash만 갈아 끼우는 최소 window 스텁. replace 호출값을 그대로 받아 둔다.
function load(hash: string) {
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
    document: {},
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { ctx: ctx as unknown as Ctx, replaced, assigned };
}

describe('기능 색인 줄 주소', () => {
  it('색인 줄 주소는 기능 묶음 아래 그 이름표를 가리킨다', () => {
    const { ctx } = load('#/');
    expect(ctx.featureRowHref('viewer-search')).toBe('#/group/__features/viewer-search');
  });
});

describe('옛 기능 주소 (#/feature/:slug)', () => {
  it('빈 화면 대신 색인 줄로 데려간다', () => {
    const { ctx, replaced } = load('#/feature/viewer-search');
    ctx.route();
    expect(replaced).toEqual(['#/group/__features/viewer-search']);
  });

  it('자리바꿈 주소의 해시는 하나뿐이다', () => {
    const { ctx, replaced } = load('#/feature/viewer-search');
    ctx.route();
    expect(replaced[0].startsWith('##')).toBe(false);
    expect(replaced[0].split('#')).toHaveLength(2);
  });

  it('되돌아갈 수 없게 자리바꿈으로만 이동한다(히스토리에 남기지 않는다)', () => {
    const { ctx, assigned } = load('#/feature/viewer-search');
    ctx.route();
    expect(assigned).toEqual([]);
  });

  it('이름표가 인코딩돼 들어와도 원래 이름표로 되돌려 보낸다', () => {
    const { ctx, replaced } = load('#/feature/' + encodeURIComponent('a b'));
    ctx.route();
    expect(replaced).toEqual(['#/group/__features/a b']);
  });
});
