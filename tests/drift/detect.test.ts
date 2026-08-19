// @concept:contract-hash @concept:settled-status @concept:atomic-baseline-write @concept:feature-spec-bridge @concept:drift-reconcile
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { computeDrift } from '../../src/drift/detect.js';
import { writeConcept, readConcept } from '../../src/store/conceptStore.js';
import { writeFeature } from '../../src/store/featureStore.js';
import { writeLock } from '../../src/drift/lock.js';
import { contractHash } from '../../src/drift/hash.js';
import { appendHistory } from '../../src/drift/history.js';

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

function touch(rel: string) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, '');
}

describe('computeDrift', () => {
  it('lock에 없는 개념은 drift가 아니다', async () => {
    await writeConcept(root, concept());
    expect(await computeDrift(root)).toEqual([]);
  });
  it('lock 해시와 현재 해시가 같으면 drift가 아니다', async () => {
    await writeConcept(root, concept());
    const c = await readConcept(root, 'auth-token');
    await writeLock(root, { 'auth-token': { hash: contractHash(c!), at: 't' } });
    expect(await computeDrift(root)).toEqual([]);
  });
  it('개념이 바뀌면 drift로 보고하고 feature codePaths를 relatedPaths로 모은다', async () => {
    touch('src/login.ts');
    await writeConcept(root, concept());
    const c1 = await readConcept(root, 'auth-token');
    await writeLock(root, { 'auth-token': { hash: contractHash(c1!), at: 't' } });
    await writeFeature(root, {
      slug: 'login',
      title: 'Login',
      concepts: ['auth-token'],
      codePaths: ['src/login.ts'],
    });
    await appendHistory(root, { slug: 'auth-token', hash: 'new', reason: '만료 단축', at: 't2' });
    await writeConcept(root, concept({ description: { definition: 'v2-변경됨' } }));
    const drift = await computeDrift(root);
    expect(drift).toHaveLength(1);
    expect(drift[0].slug).toBe('auth-token');
    expect(drift[0].reason).toBe('만료 단축');
    expect(drift[0].relatedPaths).toContain('src/login.ts');
  });
  it('aligned 기록은 drift 사유로 쓰이지 않는다(가장 최근 실제 변경 사유를 쓴다)', async () => {
    await writeConcept(root, concept());
    const c1 = await readConcept(root, 'auth-token');
    await writeLock(root, { 'auth-token': { hash: contractHash(c1!), at: 't' } });
    // 실제 변경 사유 → 그 뒤 정렬 기록(aligned). 정렬 기록이 더 최신이지만 사유로 쓰이면 안 된다.
    await appendHistory(root, {
      slug: 'auth-token',
      hash: 'h-change',
      reason: '진짜 변경 사유',
      at: 't2',
    });
    await appendHistory(root, {
      slug: 'auth-token',
      hash: 'h-aligned',
      reason: '정렬 기록',
      aligned: true,
      at: 't3',
    });
    await writeConcept(root, concept({ description: { definition: 'v2-변경됨' } }));
    const drift = await computeDrift(root);
    expect(drift[0].reason).toBe('진짜 변경 사유');
  });
  it('기준선(lock) 지문과 같은 지문으로 남긴 변경 사유는 이번 어긋남의 사유로 쓰지 않는다 — 낡은 사유 재사용 방지', async () => {
    await writeConcept(root, concept());
    const c1 = await readConcept(root, 'auth-token');
    const locked = contractHash(c1!);
    await writeLock(root, { 'auth-token': { hash: locked, at: 't' } });
    // 지난번 변경 사유(그 지문이 지금 기준선으로 이미 맞춰짐) — 이번 어긋남과 무관하다.
    await appendHistory(root, {
      slug: 'auth-token',
      hash: locked,
      reason: '지난번 사유',
      at: 't2',
    });
    await writeConcept(root, concept({ description: { definition: 'v2-변경됨' } }));
    const drift = await computeDrift(root);
    expect(drift).toHaveLength(1);
    expect(drift[0].reason).toBe('');
  });
  it('디스크에 없는 연결 경로는 relatedPaths에서 뺀다 (규칙: 사라진 경로는 연결된 코드에서 제외)', async () => {
    touch('src/login.ts');
    await writeConcept(root, concept());
    const c1 = await readConcept(root, 'auth-token');
    await writeLock(root, { 'auth-token': { hash: contractHash(c1!), at: 't' } });
    await writeFeature(root, {
      slug: 'login',
      title: 'Login',
      concepts: ['auth-token'],
      codePaths: ['src/login.ts', 'src/deleted.ts'],
    });
    await writeConcept(root, concept({ description: { definition: 'v2-변경됨' } }));
    const drift = await computeDrift(root);
    expect(drift[0].relatedPaths).toEqual(['src/login.ts']);
  });
  it('두 세대 전 사유도 이번 어긋남에 붙지 않는다 — 지금 지문의 사유가 1순위, 없으면 기준선 이후 기록만', async () => {
    await writeConcept(root, concept());
    const h1 = contractHash((await readConcept(root, 'auth-token'))!);
    await appendHistory(root, {
      slug: 'auth-token',
      hash: h1,
      reason: '아주 오래된 사유',
      at: '2026-01-01T00:00:00.000Z',
    });
    await writeConcept(root, concept({ description: { definition: 'v2' } }));
    const h2 = contractHash((await readConcept(root, 'auth-token'))!);
    await writeLock(root, { 'auth-token': { hash: h2, at: '2026-02-01T00:00:00.000Z' } });
    // 기준선(h2) 이후 손으로 v3로 고침 — 사유 기록 없음
    await writeConcept(root, concept({ description: { definition: 'v3' } }));
    const drift = await computeDrift(root);
    expect(drift).toHaveLength(1);
    expect(drift[0].reason).toBe('');
    // note-change로 지금 지문의 사유를 남기면 그것이 붙는다
    const h3 = contractHash((await readConcept(root, 'auth-token'))!);
    await appendHistory(root, {
      slug: 'auth-token',
      hash: h3,
      reason: '이번 사유',
      at: '2026-03-01T00:00:00.000Z',
    });
    expect((await computeDrift(root))[0].reason).toBe('이번 사유');
  });
  it('되돌리기(v1→v2→v1)로 옛 지문이 재등장해도 기준선 이전의 옛 사유는 붙지 않는다', async () => {
    await writeConcept(root, concept());
    const h1 = contractHash((await readConcept(root, 'auth-token'))!);
    await appendHistory(root, {
      slug: 'auth-token',
      hash: h1,
      reason: '옛날 v1 사유',
      at: '2026-01-01T00:00:00.000Z',
    });
    await writeConcept(root, concept({ description: { definition: 'v2' } }));
    const h2 = contractHash((await readConcept(root, 'auth-token'))!);
    await writeLock(root, { 'auth-token': { hash: h2, at: '2026-02-01T00:00:00.000Z' } });
    await writeConcept(root, concept()); // v1으로 되돌림 → 지문 h1, 기준선 h2와 다름
    const drift = await computeDrift(root);
    expect(drift[0].currentHash).toBe(h1);
    expect(drift[0].reason).toBe('');
  });
});
