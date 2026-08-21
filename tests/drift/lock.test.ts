// @concept:contract-hash
// 정렬 기준선(lock) 읽기·쓰기를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - contract-hash 허용 "지문을 마지막으로 맞춰둔 지문과 견주어 어긋남을 판정하는 것"
//    → 쓰고 다시 읽으면 동일하다 (견줄 기준선이 그대로 보존된다) / 없으면 빈 객체
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLock, writeLock } from '../../src/drift/lock.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
});

describe('lock', () => {
  it('없으면 빈 객체를 반환한다', async () => {
    expect(await readLock(root)).toEqual({});
  });
  it('쓰고 다시 읽으면 동일하다', async () => {
    await writeLock(root, { 'auth-token': { hash: 'a1b2', at: 't' } });
    expect(await readLock(root)).toEqual({ 'auth-token': { hash: 'a1b2', at: 't' } });
  });
});
