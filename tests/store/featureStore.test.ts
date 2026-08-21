// @concept:feature-spec-bridge @concept:atomic-baseline-write @concept:globally-unique-slug
// tests/store/featureStore.test.ts
// 기능 기록의 저장·읽기를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - feature-spec-bridge 불변 "개념과 코드의 연결은 기능 기록 한 곳에만 적고, 반대 방향은 그것에서
//    파생시킨다" → 기능을 그룹 폴더에 쓰고 다시 읽는다 / 그룹 하위까지 재귀로 나열한다 / 없으면 빈 배열
//  - globally-unique-slug 불변 "기능 이름표는 기능들 사이에서 유일하다 — 묶음이 달라도 같은 벌 안에서는
//    두 번 쓸 수 없다" → 다른 그룹에 동일 slug 쓰기를 거부한다 / 동일 경로 덮어쓰기는 허용한다
//  - atomic-baseline-write 불변 "대상 기록은 갈아 끼우기 방식으로만 저장한다" + "임시 파일 이름이 이미
//    있으면 그것을 따라가지 않고 실패시킨다"
//    → 덮어쓸 때 원자적 저장을 쓰고, 심볼릭 링크를 따라가 다른 파일을 오염시키지 않는다
import { describe, it, expect, beforeEach } from 'vitest';
import { lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFeature, listFeatures, readFeature } from '../../src/store/featureStore.js';

const base = {
  slug: 'user-login',
  group: 'auth',
  title: 'User Login',
  concepts: ['auth'],
  codePaths: ['src/a.ts'],
};
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
});

describe('featureStore', () => {
  it('기능을 그룹 폴더에 쓰고 다시 읽는다', async () => {
    await writeFeature(root, base as any);
    const read = await readFeature(root, 'user-login');
    expect(read?.title).toBe('User Login');
    expect(read?.codePaths).toEqual(['src/a.ts']);
  });
  it('모든 기능을 그룹 하위까지 재귀로 나열한다', async () => {
    await writeFeature(root, base as any);
    await writeFeature(root, { ...base, slug: 'logout', group: 'auth' } as any);
    await writeFeature(root, { ...base, slug: 'billing-meter', group: 'billing' } as any);
    const all = await listFeatures(root);
    expect(all.map((f) => f.slug).sort()).toEqual(['billing-meter', 'logout', 'user-login']);
  });
  it('다른 그룹에 동일 slug 쓰기를 거부한다 (전역 고유)', async () => {
    await writeFeature(root, { ...base, group: 'auth' } as any);
    await expect(writeFeature(root, { ...base, group: 'billing' } as any)).rejects.toThrow(
      'Duplicate feature slug'
    );
  });
  it('동일 경로 덮어쓰기는 허용한다', async () => {
    await writeFeature(root, { ...base, title: 'v1' } as any);
    await writeFeature(root, { ...base, title: 'v2' } as any);
    expect((await readFeature(root, 'user-login'))?.title).toBe('v2');
  });
  it('기능이 없으면 빈 배열을 반환한다', async () => {
    expect(await listFeatures(root)).toEqual([]);
  });
  it('덮어쓸 때 원자적 저장을 쓴다 — 심볼릭 링크를 따라가 다른 파일을 오염시키지 않는다', async () => {
    await writeFeature(root, { ...base, title: 'v1' } as any);
    const target = join(root, 'docs', 'conceptpowers', 'features', 'auth', 'user-login.json');
    // 미끼는 유효한 v1 내용 — 덮어쓰기 전 중복 검사가 읽어도 죽지 않아야 한다.
    const v1 = readFileSync(target, 'utf8');
    const decoy = join(root, 'decoy.json');
    writeFileSync(decoy, v1);
    rmSync(target);
    symlinkSync(decoy, target);

    await writeFeature(root, { ...base, title: 'v2' } as any);

    expect(lstatSync(target).isSymbolicLink()).toBe(false);
    expect(readFileSync(decoy, 'utf8')).toBe(v1);
    expect((await readFeature(root, 'user-login'))?.title).toBe('v2');
  });
});
