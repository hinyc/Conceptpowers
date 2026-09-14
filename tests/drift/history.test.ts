// @concept:drift-reconcile @concept:settled-status
// 변경 이력(history) 기록을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - drift-reconcile 불변 "무시하고 넘어간 개념은 예외 없이 무시했다는 기록을 남긴다"
//    → append가 같은 slug의 직전 hash를 prevHash로 이어, 기록이 끊기지 않게 한다
//  - drift-reconcile 허용 "지문을 마지막으로 맞춰둔 지문과 견주어 어긋남을 판정하는 것"
//    → noteChange는 개념의 현재 계약 해시로 이유를 기록한다 / 없는 개념이면 throw
//  - drift-reconcile 불변 "결산 이력은 기존 기록을 고쳐 쓰지 않고 새 기록을 더하기만 한다 — 브랜치마다 쌓인 이력이
//    합쳐질 때 서로 충돌하지 않게 한다"
//    → 기록마다 새 파일을 더하고 이미 있는 파일은 그대로 둔다 / 예전 한 파일 이력도 읽고 그 뒤에 잇는다
//    → 읽을 수 없는 기록 파일 하나 때문에 나머지 이력을 잃지 않는다
//  - 상위 기준 문서 "갈아 끼우기 방식"의 구성요소 "대상: … 변경 이력 …" → 기록이 없으면 빈 배열(깨진 값 대신 안전한 기본값)
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readHistory, appendHistory } from '../../src/drift/history.js';
import { noteChange } from '../../src/drift/note.js';
import { writeConcept } from '../../src/store/conceptStore.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
});

describe('history', () => {
  it('없으면 빈 배열', async () => {
    expect(await readHistory(root)).toEqual([]);
  });
  it('append는 같은 slug의 직전 hash를 prevHash로 연결한다', async () => {
    await appendHistory(root, { slug: 'auth-token', hash: 'h1', reason: '최초', at: 't1' });
    const e2 = await appendHistory(root, {
      slug: 'auth-token',
      hash: 'h2',
      reason: '변경',
      at: 't2',
    });
    expect(e2.prevHash).toBe('h1');
    expect(await readHistory(root)).toHaveLength(2);
  });
  it('noteChange는 개념의 현재 계약 해시로 이유를 기록한다', async () => {
    await writeConcept(root, {
      slug: 'auth-token',
      category: ['behavior'],
      title: 'A',
      description: { definition: 'd' },
      purpose: { reason: 'r' },
      actions: {},
      principle: {},
    });
    const e = await noteChange(root, 'auth-token', '만료 30분으로', 't1');
    expect(e.slug).toBe('auth-token');
    expect(e.reason).toBe('만료 30분으로');
    expect(e.hash).toMatch(/^\d+:[0-9a-f]{12}$/); // 판 접두 + 12자리 지문
  });
  it('noteChange는 없는 개념이면 throw', async () => {
    await expect(noteChange(root, 'ghost', 'x', 't')).rejects.toThrow('ghost');
  });
  it('기록마다 새 파일을 더하고 이미 있는 기록 파일은 고쳐 쓰지 않는다 [규칙: 새 기록을 더하기만 한다]', async () => {
    const dir = join(root, 'docs/conceptpowers/concepts/.alignment/history');
    await appendHistory(root, { slug: 'auth-token', hash: 'h1', reason: '최초', at: 't1' });
    const [first] = readdirSync(dir);
    const before = readFileSync(join(dir, first), 'utf8');
    await appendHistory(root, { slug: 'auth-token', hash: 'h2', reason: '변경', at: 't2' });
    expect(readdirSync(dir)).toHaveLength(2);
    expect(readFileSync(join(dir, first), 'utf8')).toBe(before);
  });
  it('예전 한 파일 이력도 읽고, 새 기록은 그 뒤에 이어 prevHash로 연결한다 [규칙: 새 기록을 더하기만 한다]', async () => {
    const legacy = join(root, 'docs/conceptpowers/concepts/.alignment/history.json');
    mkdirSync(join(legacy, '..'), { recursive: true });
    writeFileSync(legacy, JSON.stringify([{ slug: 'auth-token', hash: 'h1', at: 't1' }]));
    const before = readFileSync(legacy, 'utf8');
    const e2 = await appendHistory(root, {
      slug: 'auth-token',
      hash: 'h2',
      reason: '변경',
      at: 't2',
    });
    expect(e2.prevHash).toBe('h1');
    expect((await readHistory(root)).map((e) => e.hash)).toEqual(['h1', 'h2']);
    expect(readFileSync(legacy, 'utf8')).toBe(before);
  });
  it('읽을 수 없는 기록 파일 하나 때문에 나머지 이력을 잃지 않는다', async () => {
    await appendHistory(root, { slug: 'auth-token', hash: 'h1', reason: '최초', at: 't1' });
    writeFileSync(
      join(root, 'docs/conceptpowers/concepts/.alignment/history/zz-broken.json'),
      '{ not json'
    );
    expect((await readHistory(root)).map((e) => e.hash)).toEqual(['h1']);
  });
});
