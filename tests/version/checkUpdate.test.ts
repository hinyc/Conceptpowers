// @concept:plugin-version-sync
// 새 버전 확인(checkForUpdate)을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - plugin-version-sync 허용 "무엇을 맞췄는지 사용자에게 한 줄로 알리는 것"
//    → 최신이 더 높으면 {installed, latest}를 돌려준다 / 같거나 낮으면 null
//  - plugin-version-sync 불변 "이미 존재하는 파일의 내용은 지우거나 바꾸지 않는다"
//    → 확인이 실패해도(fetch 실패·비200·깨진 JSON·설치 정보 없음) throw 없이 null로 조용히 물러난다
//  - 캐시 유효·만료 시나리오는 개념 규칙이 아니라 확인 횟수를 줄이기 위한 구현 세부다.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkForUpdate } from '../../src/version/checkUpdate.js';

// 설치된 plugin.json(.claude-plugin/plugin.json)을 가진 가짜 pluginRoot 생성
function makePluginRoot(installed: string): string {
  const root = mkdtempSync(join(tmpdir(), 'cp-plugin-'));
  mkdirSync(join(root, '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(root, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'conceptpowers', version: installed })
  );
  return root;
}
function makeCacheDir(): string {
  return mkdtempSync(join(tmpdir(), 'cp-cache-'));
}
function okResponse(version: string) {
  return { ok: true, json: async () => ({ version }) } as Response;
}

let cacheDir: string;
beforeEach(() => {
  cacheDir = makeCacheDir();
});

describe('checkForUpdate', () => {
  it('최신이 더 높으면 {installed, latest} 반환하고 fetch를 호출한다', async () => {
    const root = makePluginRoot('0.1.0');
    const fetchImpl = vi.fn(async () => okResponse('0.2.0'));
    const r = await checkForUpdate(root, { fetchImpl: fetchImpl as any, cacheDir, now: 1000 });
    expect(r).toEqual({ installed: '0.1.0', latest: '0.2.0' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('최신이 같거나 낮으면 null', async () => {
    const root = makePluginRoot('0.2.0');
    const fetchImpl = vi.fn(async () => okResponse('0.2.0'));
    const r = await checkForUpdate(root, { fetchImpl: fetchImpl as any, cacheDir, now: 1000 });
    expect(r).toBeNull();
  });

  it('캐시가 유효하면 fetch를 호출하지 않고 캐시 latest로 비교한다', async () => {
    const root = makePluginRoot('0.1.0');
    // 캐시를 미리 기록(0.3.0, 방금 확인함)
    writeFileSync(
      join(cacheDir, 'update-check.json'),
      JSON.stringify({ checkedAt: 1000, latest: '0.3.0' })
    );
    const fetchImpl = vi.fn(async () => okResponse('0.9.0'));
    const r = await checkForUpdate(root, {
      fetchImpl: fetchImpl as any,
      cacheDir,
      now: 1000 + 60_000,
      ttlMs: 86_400_000,
    });
    expect(r).toEqual({ installed: '0.1.0', latest: '0.3.0' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('캐시가 만료되면 fetch하고 캐시를 갱신한다', async () => {
    const root = makePluginRoot('0.1.0');
    writeFileSync(
      join(cacheDir, 'update-check.json'),
      JSON.stringify({ checkedAt: 0, latest: '0.1.0' })
    );
    const fetchImpl = vi.fn(async () => okResponse('0.4.0'));
    const r = await checkForUpdate(root, {
      fetchImpl: fetchImpl as any,
      cacheDir,
      now: 86_400_000 + 1,
      ttlMs: 86_400_000,
    });
    expect(r).toEqual({ installed: '0.1.0', latest: '0.4.0' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('fetch 실패면 null(throw 안 함)', async () => {
    const root = makePluginRoot('0.1.0');
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const r = await checkForUpdate(root, { fetchImpl: fetchImpl as any, cacheDir, now: 1000 });
    expect(r).toBeNull();
  });

  it('비 200 응답이면 null', async () => {
    const root = makePluginRoot('0.1.0');
    const fetchImpl = vi.fn(async () => ({ ok: false }) as Response);
    const r = await checkForUpdate(root, { fetchImpl: fetchImpl as any, cacheDir, now: 1000 });
    expect(r).toBeNull();
  });

  it('설치 plugin.json이 없으면 fetch 없이 null', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cp-empty-'));
    const fetchImpl = vi.fn(async () => okResponse('9.9.9'));
    const r = await checkForUpdate(root, { fetchImpl: fetchImpl as any, cacheDir, now: 1000 });
    expect(r).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('ok 응답이지만 본문 JSON이 깨지면 null(throw 안 함)', async () => {
    const root = makePluginRoot('0.1.0');
    const fetchImpl = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => {
            throw new SyntaxError('bad json');
          },
        }) as Response
    );
    const r = await checkForUpdate(root, { fetchImpl: fetchImpl as any, cacheDir, now: 1000 });
    expect(r).toBeNull();
  });
});
