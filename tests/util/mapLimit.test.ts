// @concept:reference-sync
// tests/util/mapLimit.test.ts
// 기준점 찍기·견주기가 참고자료 파일을 한꺼번에 열지 않도록 쓰는 동시 실행 제한 map을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-sync 허용 "현재 참고자료 전체의 지문을 기준점으로 찍는 것"
//    → 전체 항목을 빠짐없이 입력 순서대로 처리하되, 한 번에 실행 중인 수는 상한을 넘지 않는다
//    → 빈 입력이면 빈 결과
import { describe, it, expect } from 'vitest';
import { mapLimit } from '../../src/util/mapLimit.js';

describe('mapLimit', () => {
  it('입력 순서대로 결과를 돌려주고 동시 실행 수를 넘지 않는다', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('빈 입력이면 빈 결과', async () => {
    expect(await mapLimit([], 4, async (n: number) => n)).toEqual([]);
  });
});
