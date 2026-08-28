// @concept:drift-reconcile @concept:settled-status @concept:feature-spec-bridge
// 커밋 뒤 결산(reconcileAfterCommit)을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - drift-reconcile 불변 "결산은 이번 커밋에 맞물린 개념만 한다 — 맞물리지 않은 개념은 어긋난 채
//    남겨 둔다" → 무관한 커밋은 결산·기준선 갱신 없이 어긋남 유지
//  - drift-reconcile 구성요소 "따라옴 / 무시함" → 맞물린 개념의 aligned·ignored 분류,
//    하나만 들어와도 aligned / 문서만 들어오면 ignored
//  - drift-reconcile 불변 "따라옴이든 무시함이든, 결산한 개념의 기준선은 반드시 현재 지문으로 다시
//    맞춘다" → aligned·ignored 양쪽에서 lock을 현재 해시로 갱신
//  - drift-reconcile 불변 "무시하고 넘어간 개념은 예외 없이 무시했다는 기록을 남긴다"
//    → history에 ignored 기록
//  - drift-reconcile 허용 "새로 생긴 개념을 기준선에 등록하고, 사라진 개념의 낡은 기록을 지우는 것"
//    → 신규 개념을 현재 해시로 등록 / 삭제된 개념의 stale lock 정리
//  - drift-reconcile 허용 "이제 존재하지 않는 파일 경로는 연결된 코드에서 빼고 판정하는 것"
//    → 사라진 경로는 빼고 견준다 / 전부 사라졌으면 따라올 것이 없어 문서 커밋에서 aligned
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { reconcileAfterCommit } from '../../src/drift/reconcile.js';
import { writeConcept, readConcept } from '../../src/store/conceptStore.js';
import { writeFeature } from '../../src/store/featureStore.js';
import { writeLock, readLock } from '../../src/drift/lock.js';
import { readHistory } from '../../src/drift/history.js';
import { contractHash } from '../../src/drift/hash.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
});

const concept = (over: Record<string, unknown> = {}) => ({
  slug: 'auth-token',
  category: ['behavior'],
  title: 'A',
  description: { definition: 'v1' },
  purpose: { reason: 'r' },
  actions: {},
  principle: {},
  ...over,
});

// 픽스처 개념(auth-token, group 없음)의 문서 경로 — 맞물림 판정에 쓴다.
const DOC = 'docs/conceptpowers/concepts/data/auth-token.json';

function touch(rel: string) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, '');
}

// v1을 lock에 등록한 뒤 v2로 바꿔 drift를 만든다. 연결 코드는 디스크에 실제로 둔다.
async function makeDrift(codePaths: string[] = ['src/login.ts']) {
  codePaths.forEach(touch);
  await writeConcept(root, concept());
  const c1 = await readConcept(root, 'auth-token');
  await writeLock(root, { 'auth-token': { hash: contractHash(c1!), at: 't' } });
  await writeFeature(root, {
    slug: 'login',
    title: 'L',
    concepts: ['auth-token'],
    codePaths,
  });
  await writeConcept(root, concept({ description: { definition: 'v2' } }));
}

describe('reconcileAfterCommit', () => {
  it('관련 코드가 커밋에 포함되면 aligned로 분류하고 lock을 현재 해시로 갱신', async () => {
    await makeDrift();
    const c2 = await readConcept(root, 'auth-token');
    const r = await reconcileAfterCommit(root, ['src/login.ts'], 't2');
    expect(r.aligned).toContain('auth-token');
    expect(r.ignored).toEqual([]);
    expect((await readLock(root))['auth-token'].hash).toBe(contractHash(c2!));
  });
  it('관련 코드가 커밋에 포함되면 history에 aligned 기록(ignored=false, aligned=true)', async () => {
    await makeDrift();
    const c2 = await readConcept(root, 'auth-token');
    await reconcileAfterCommit(root, ['src/login.ts'], 't2');
    const h = await readHistory(root);
    const e = h.find((x) => x.slug === 'auth-token');
    expect(e?.aligned).toBe(true);
    expect(e?.ignored).toBe(false);
    expect(e?.hash).toBe(contractHash(c2!));
  });
  it('연결 코드가 여럿일 때 하나만 들어와도 aligned다 (규칙: 따라옴 = 하나라도 함께 들어온 경우)', async () => {
    await makeDrift(['src/login.ts', 'src/session.ts', 'tests/login.test.ts']);
    const r = await reconcileAfterCommit(root, ['src/session.ts'], 't2');
    expect(r.aligned).toContain('auth-token');
    expect(r.ignored).toEqual([]);
    const e = (await readHistory(root)).find((x) => x.slug === 'auth-token');
    expect(e?.aligned).toBe(true);
  });
  it('디스크에서 사라진 연결 경로는 판정에서 빼고, 남은 경로만 견준다 (규칙: 사라진 경로 제외)', async () => {
    await makeDrift(['src/login.ts']);
    await writeFeature(root, {
      slug: 'login',
      title: 'L',
      concepts: ['auth-token'],
      codePaths: ['src/login.ts', 'src/removed.ts'],
    });
    // 개념 문서만 커밋 — 사라진 src/removed.ts는 빼고, 남은 src/login.ts가 안 들어왔으므로 ignored.
    const r = await reconcileAfterCommit(root, [DOC], 't2');
    expect(r.ignored).toContain('auth-token');
    const r2 = await reconcileAfterCommit(root, ['src/login.ts'], 't3');
    // 이미 결산돼 drift가 아니므로 aligned/ignored 어디에도 없어야 정상(기준선 재조정 확인)
    expect(r2.aligned).toEqual([]);
    expect(r2.ignored).toEqual([]);
  });
  it('연결 경로가 전부 사라졌으면 따라올 것이 없으므로 개념 문서 커밋에서 aligned로 결산한다', async () => {
    await makeDrift([]);
    await writeFeature(root, {
      slug: 'login',
      title: 'L',
      concepts: ['auth-token'],
      codePaths: ['src/gone.ts'],
    });
    const r = await reconcileAfterCommit(root, [DOC], 't2');
    expect(r.aligned).toContain('auth-token');
  });
  it('무관한 커밋은 결산하지 않는다 — 기준선·이력을 건드리지 않고 어긋남을 유지한다 (규칙: 맞물린 개념만 결산)', async () => {
    await makeDrift();
    const c1Hash = (await readLock(root))['auth-token'].hash;
    const r = await reconcileAfterCommit(root, ['README.md'], 't2');
    expect(r.aligned).toEqual([]);
    expect(r.ignored).toEqual([]);
    expect((await readLock(root))['auth-token'].hash).toBe(c1Hash); // 기준선 유지 = 어긋남 유지
    expect((await readHistory(root)).filter((e) => e.aligned || e.ignored)).toEqual([]);
  });
  it('개념 문서만 커밋되고 관련 코드가 하나도 안 들어오면 ignored로 분류하고 history 기록 + lock 갱신', async () => {
    await makeDrift();
    const r = await reconcileAfterCommit(root, [DOC], 't2');
    expect(r.ignored).toContain('auth-token');
    const h = await readHistory(root);
    expect(h.some((e) => e.slug === 'auth-token' && e.ignored)).toBe(true);
    const c2 = await readConcept(root, 'auth-token');
    expect((await readLock(root))['auth-token'].hash).toBe(contractHash(c2!));
  });
  it('lock에 없던 신규 개념은 현재 해시로 등록한다', async () => {
    await writeConcept(root, concept());
    const c = await readConcept(root, 'auth-token');
    const r = await reconcileAfterCommit(root, [], 't1');
    expect(r.aligned).toEqual([]);
    expect(r.ignored).toEqual([]);
    expect((await readLock(root))['auth-token'].hash).toBe(contractHash(c!));
  });
  it('경로 표기가 달라도(./ 접두) 정규화해 aligned로 본다 (H1)', async () => {
    touch('src/login.ts'); // 실제 파일이 있어야 프루닝을 지나 정규화 비교가 이뤄진다
    await writeConcept(root, concept());
    const c1 = await readConcept(root, 'auth-token');
    await writeLock(root, { 'auth-token': { hash: contractHash(c1!), at: 't' } });
    // codePaths는 './' 접두, 커밋 파일은 git 표기(접두 없음)
    await writeFeature(root, {
      slug: 'login',
      title: 'L',
      concepts: ['auth-token'],
      codePaths: ['./src/login.ts'],
    });
    await writeConcept(root, concept({ description: { definition: 'v2' } }));
    const r = await reconcileAfterCommit(root, ['src/login.ts'], 't2');
    expect(r.aligned).toContain('auth-token');
    expect(r.ignored).toEqual([]);
  });
  it('판이 다른 기준선은 결산 때 현재 지문으로 재기준하고, 어긋남 기록은 남기지 않는다', async () => {
    await writeConcept(root, concept());
    await writeLock(root, { 'auth-token': { hash: 'a1b2c3d4e5f6', at: 't' } }); // 옛 판(접두 없음)
    const res = await reconcileAfterCommit(root, [], 't2');
    expect(res.aligned).toEqual([]);
    expect(res.ignored).toEqual([]);
    const lock = await readLock(root);
    const c = await readConcept(root, 'auth-token');
    expect(lock['auth-token'].hash).toBe(contractHash(c!)); // 현재 판으로 재기준됨
  });
  it('삭제된 개념의 stale lock 항목을 정리한다 (M1)', async () => {
    await writeConcept(root, concept());
    await writeLock(root, {
      'auth-token': { hash: 'old', at: 't' },
      'deleted-one': { hash: 'x', at: 't' },
    });
    await reconcileAfterCommit(root, [], 't2');
    const lock = await readLock(root);
    expect(lock['deleted-one']).toBeUndefined();
    expect(lock['auth-token']).toBeDefined();
  });
});
