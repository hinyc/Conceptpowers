// @concept:settled-status
// tests/viewer/statusApi.test.ts
// 뷰어의 상태 변경 통로(POST /api/concept/:slug/status → src/viewer/statusApi.ts)를 검증한다.
// 출처 확인(내 컴퓨터·같은 화면)은 앞단 serve.ts가 맡고, 여기서는 상태 전이 규칙만 본다.
// 검증 대상 규칙 ↔ 시나리오:
//  - settled-status 불변 "빨강을 초록으로 올리는 것은 사람이 명시적으로 요청했을 때만 한다" +
//    "초록이 되려면 … 품질 최소치와 검사 증빙이 갖춰져야 한다"
//    → 증빙을 갖춘 red→green 요청은 반영되고 manifest도 새 상태로 갱신된다 / 증빙이 없으면 400
//  - settled-status 불변 "한 번 확정된 초록·빨강은 시스템 경로로는 되돌리지 않는다"
//    → green→red, red→pending 요청은 400이고 디스크는 그대로다
//  - 메서드·이름표·본문 오류(405/400)와 없는 개념(404)은 개념 규칙이 아니라 HTTP 계약이다.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleStatusApi } from '../../src/viewer/statusApi.js';
import { writeConcept, readConcept } from '../../src/store/conceptStore.js';
import { recordAttest } from '../../src/concept/attest.js';
import { parseConcept } from '../../src/schema/concept.js';

const base = {
  slug: 'admin-role',
  group: 'auth',
  category: ['role'],
  title: 'Admin Role',
  description: { definition: 'd' },
  purpose: { reason: 'r' },
  actions: {},
  principle: {},
};
const qualified = {
  ...base,
  state: { managed: ['이 개념이 관리하는 대상'] },
  principle: {
    immutableRules: ['이 개념의 규칙은 열 글자 이상이다'],
    operationalPrinciple: '조건이 갖춰지면 그대로 판정된다',
  },
  sources: [{ kind: 'decision', locator: '2026-09-12', supports: '검사용 결정' }],
};
const body = (status: unknown) => JSON.stringify({ status });

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-status-'));
});

describe('handleStatusApi — 상태 전이 규칙', () => {
  it('증빙을 갖춘 red→green은 반영되고 manifest도 갱신된다', async () => {
    await writeConcept(root, qualified);
    await recordAttest(root, parseConcept(qualified), 'pass');
    const r = await handleStatusApi(root, 'POST', 'admin-role', body('green'));
    expect(r.status).toBe(200);
    expect((await readConcept(root, 'admin-role'))?.status).toBe('green');
    const manifest = JSON.parse(
      readFileSync(join(root, 'docs/conceptpowers/concepts/viewer/manifest.json'), 'utf8')
    );
    expect(manifest.concepts[0].status).toBe('green');
  });

  it('검사 증빙이 없으면 초록으로 올리지 않는다(400)', async () => {
    await writeConcept(root, qualified);
    const r = await handleStatusApi(root, 'POST', 'admin-role', body('green'));
    expect(r.status).toBe(400);
    expect((await readConcept(root, 'admin-role'))?.status).toBe('red');
  });

  it('확정된 green·red는 되돌리지 않는다(400, 디스크 그대로)', async () => {
    await writeConcept(root, { ...base, status: 'green' });
    expect((await handleStatusApi(root, 'POST', 'admin-role', body('red'))).status).toBe(400);
    expect((await readConcept(root, 'admin-role'))?.status).toBe('green');
    await writeConcept(root, { ...base, status: 'red' });
    expect((await handleStatusApi(root, 'POST', 'admin-role', body('pending'))).status).toBe(400);
    expect((await readConcept(root, 'admin-role'))?.status).toBe('red');
  });
});

describe('handleStatusApi — HTTP 계약', () => {
  it('POST가 아니면 405', async () => {
    expect((await handleStatusApi(root, 'GET', 'admin-role', '')).status).toBe(405);
  });
  it('이름표 모양이 틀리면 400', async () => {
    expect((await handleStatusApi(root, 'POST', 'Bad_Slug', body('red'))).status).toBe(400);
  });
  it('본문이 JSON이 아니거나 상태 값이 틀리면 400', async () => {
    await writeConcept(root, base);
    expect((await handleStatusApi(root, 'POST', 'admin-role', '{')).status).toBe(400);
    expect((await handleStatusApi(root, 'POST', 'admin-role', body('blue'))).status).toBe(400);
  });
  it('없는 개념은 404', async () => {
    expect((await handleStatusApi(root, 'POST', 'ghost', body('green'))).status).toBe(404);
  });
});
