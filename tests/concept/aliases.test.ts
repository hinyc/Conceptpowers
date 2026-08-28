// @concept:globally-unique-slug @concept:drift-reconcile
// tests/concept/aliases.test.ts
// 개념 별칭의 저장 규칙과 계약 해시 영향을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - globally-unique-slug 불변 "별칭이 하나도 없는 것이 정상이다 — 별칭은 혼용이 있을 때만 생기고,
//    정리되면 사라진다" → aliases를 안 적어도 파싱되고 빈 배열이 된다
//  - globally-unique-slug 불변 "한 개념의 정식 이름은 언제나 하나다 — 별칭이 몇 개든 이름은 늘지
//    않는다" → 별칭을 여럿 달아도 title은 하나 그대로다
//  - globally-unique-slug 불변 "한 별칭은 딱 한 번만 적힌다 — 두 개념이 같은 별칭을 가질 수 없고,
//    한 개념 안에서 같은 별칭을 두 번 적지도 않는다"
//    → 다른 개념이 이미 쓰는 별칭으로 저장하면 거절된다 / 한 개념 안의 같은 별칭 반복도
//      거절된다 / 자기 별칭을 그대로 다시 저장하는 것은 충돌이 아니다
//  - globally-unique-slug 불변 "별칭은 어떤 개념의 이름표와도 같을 수 없다 — 같으면 무엇을
//    가리키는지 알 수 없다" → 남의 이름표든 자기 이름표든 별칭으로 쓰면 거절된다
//  - drift-reconcile 불변 "약속 밖 항목만 바뀐 경우에는 지문이 달라지지 않는다"
//    → 별칭만 바꾸면 계약 해시가 그대로다 (별칭 편집이 어긋남 경고를 내지 않는다)
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeConcept, readConcept } from '../../src/store/conceptStore.js';
import { parseConcept } from '../../src/schema/concept.js';
import { contractHash } from '../../src/drift/hash.js';

const base = {
  slug: 'product-line',
  group: 'domain',
  category: ['term'],
  title: '제품군',
  description: { definition: '사업부 아래의 모델 묶음', example: 'e' },
  purpose: { reason: 'r' },
  actions: {},
  principle: {},
};

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-alias-'));
});

describe('개념 별칭 — 스키마', () => {
  it('별칭이 하나도 없는 것이 정상이다 — 안 적으면 빈 배열이 된다', () => {
    expect(parseConcept(base).aliases).toEqual([]);
  });

  it('이미 쓰이던 말이 여럿이면 별칭도 여럿 적을 수 있다', () => {
    expect(parseConcept({ ...base, aliases: ['부서', 'Department'] }).aliases).toEqual([
      '부서',
      'Department',
    ]);
  });

  it('별칭을 여럿 달아도 정식 이름은 하나 그대로다', () => {
    const many = parseConcept({ ...base, aliases: ['부서', 'Department', 'PL'] });
    expect(many.title).toBe('제품군');
    expect(Object.keys(many).filter((k) => /title|name/i.test(k))).toEqual(['title']);
  });
});

describe('개념 별칭 — 저장 규칙', () => {
  it('다른 개념이 이미 쓰는 별칭은 거절한다', async () => {
    await writeConcept(root, { ...base, aliases: ['부서'] });
    await expect(
      writeConcept(root, { ...base, slug: 'division', title: '사업부', aliases: ['부서'] })
    ).rejects.toThrow(/부서/);
  });

  it('자기 별칭을 그대로 다시 저장하는 것은 충돌이 아니다', async () => {
    await writeConcept(root, { ...base, aliases: ['부서'] });
    await writeConcept(root, { ...base, aliases: ['부서', 'Department'] });
    expect((await readConcept(root, 'product-line'))?.aliases).toEqual(['부서', 'Department']);
  });

  it('다른 개념의 이름표와 같은 별칭은 거절한다', async () => {
    await writeConcept(root, base);
    await expect(
      writeConcept(root, { ...base, slug: 'division', title: '사업부', aliases: ['product-line'] })
    ).rejects.toThrow(/product-line/);
  });

  it('한 개념 안에서 같은 별칭을 두 번 적으면 거절한다', async () => {
    await expect(writeConcept(root, { ...base, aliases: ['부서', '부서'] })).rejects.toThrow(
      /부서/
    );
  });

  it('자기 이름표와 같은 별칭도 거절한다', async () => {
    await expect(writeConcept(root, { ...base, aliases: ['product-line'] })).rejects.toThrow(
      /product-line/
    );
  });
});

describe('개념 별칭 — 어긋남 판정', () => {
  it('별칭만 바뀌면 계약 해시가 달라지지 않는다', () => {
    const before = contractHash(parseConcept(base));
    const after = contractHash(parseConcept({ ...base, aliases: ['부서', 'Department'] }));
    expect(after).toBe(before);
  });
});
