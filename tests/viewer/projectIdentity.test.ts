// @concept:human-owns-contract @concept:concept-inline-edit
// tests/viewer/projectIdentity.test.ts
// 뷰어 서버의 프로젝트 식별과 브라우저 없는 실행(승인 요청 때 CLI가 이 프로젝트의 뷰어를 찾아 조용히 띄운다)을 검증한다.
//  - 같은 폴더는 실제 경로든 심볼릭 링크 경로든 같은 id, 다른 폴더는 다른 id
//  - name은 package.json의 비어 있지 않은 name, 없거나 깨졌거나 비었으면 폴더 이름
//  - /api/health는 project {id, name}만(pid·전체 경로 없음) 싣되 전체 경로는 싣지 않고, 비로컬 요청은 여전히 403
//  - 포트 범위 4173~4192, EADDRINUSE·EACCES는 다음 포트로, --no-open이면 브라우저를 열지 않는다
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { readProjectIdentity, VIEWER_PORTS } from '../../src/viewer/projectIdentity.js';
import {
  handleApi,
  isSkippablePortError,
  shouldOpenBrowser,
  startServer,
} from '../../src/viewer/serve.js';

function tempProject(files: Record<string, string> = {}, dirName = 'proj'): string {
  const base = mkdtempSync(join(tmpdir(), 'cp-ident-'));
  const dir = join(base, dirName);
  mkdirSync(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

describe('readProjectIdentity — id', () => {
  it('실제 경로와 심볼릭 링크 경로는 같은 id', () => {
    const dir = tempProject();
    const link = join(mkdtempSync(join(tmpdir(), 'cp-link-')), 'alias');
    symlinkSync(dir, link);
    const a = readProjectIdentity(dir);
    expect(readProjectIdentity(link).id).toBe(a.id);
    expect(readProjectIdentity(realpathSync.native(dir)).id).toBe(a.id);
    expect(a.id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('다른 폴더는 다른 id', () => {
    expect(readProjectIdentity(tempProject()).id).not.toBe(readProjectIdentity(tempProject()).id);
  });

  it('없는 폴더여도 던지지 않는다', () => {
    expect(() => readProjectIdentity(join(tmpdir(), 'cp-no-such-dir-xyz'))).not.toThrow();
  });
});

describe('readProjectIdentity — name', () => {
  it('package.json의 name을 쓴다', () => {
    const dir = tempProject({ 'package.json': JSON.stringify({ name: 'my-app' }) });
    expect(readProjectIdentity(dir).name).toBe('my-app');
  });

  it.each([
    ['package.json 없음', {}],
    ['깨진 package.json', { 'package.json': '{ not json' }],
    ['빈 name', { 'package.json': JSON.stringify({ name: '' }) }],
    ['공백뿐인 name', { 'package.json': JSON.stringify({ name: '   ' }) }],
    ['문자열이 아닌 name', { 'package.json': JSON.stringify({ name: 42 }) }],
    ['null package.json', { 'package.json': 'null' }],
  ])('%s → 폴더 이름', (_label, files) => {
    const dir = tempProject(files, 'folder-name');
    expect(readProjectIdentity(dir).name).toBe(basename(realpathSync.native(dir)));
    expect(readProjectIdentity(dir).name).toBe('folder-name');
  });
});

describe('/api/health의 project', () => {
  const get = (root: string, headers: Record<string, string>) =>
    handleApi(root, { method: 'GET', url: '/api/health', headers, body: '' });

  it('id·name만 싣고 pid·전체 경로는 싣지 않는다', async () => {
    const dir = tempProject({ 'package.json': JSON.stringify({ name: 'shown-name' }) });
    const res = await get(dir, { host: 'localhost:4173' });
    const json = res.json as {
      editable: boolean;
      transitions: unknown;
      project: { id: string; name: string };
    };
    expect(res.status).toBe(200);
    expect(json.editable).toBe(true);
    expect(json.transitions).toBeTruthy();
    expect(json.project).toEqual({
      id: readProjectIdentity(dir).id,
      name: 'shown-name',
    });
    expect(JSON.stringify(res.json)).not.toContain(dir);
    expect(JSON.stringify(res.json)).not.toContain(realpathSync.native(dir));
  });

  it('/api/shutdown: 같은 id만 200+종료 표시, 다른 id·깨진 본문은 거절, 교차 출처·비로컬은 403', async () => {
    const dir = tempProject();
    const id = readProjectIdentity(dir).id;
    const base = {
      host: 'localhost:4173',
      origin: 'http://localhost:4173',
      'content-type': 'application/json',
    };
    const post = (headers: Record<string, string>, body: string) =>
      handleApi(dir, { method: 'POST', url: '/api/shutdown', headers, body });
    expect(await post(base, JSON.stringify({ projectId: id }))).toMatchObject({
      status: 200,
      shutdown: true,
    });
    expect(await post(base, JSON.stringify({ projectId: 'other' }))).toMatchObject({ status: 403 });
    expect((await post(base, JSON.stringify({ projectId: 'other' }))).shutdown).toBeUndefined();
    expect(await post(base, '{}')).toMatchObject({ status: 403 });
    expect(await post(base, '{bad')).toMatchObject({ status: 400 });
    const body = JSON.stringify({ projectId: id });
    expect(await post({ ...base, origin: 'http://evil.example' }, body)).toMatchObject({
      status: 403,
    });
    expect(await post({ ...base, 'sec-fetch-site': 'cross-site' }, body)).toMatchObject({
      status: 403,
    });
    expect(await post({ ...base, 'content-type': 'text/plain' }, body)).toMatchObject({
      status: 403,
    });
    expect(await post({ ...base, host: 'attacker.example' }, body)).toMatchObject({ status: 403 });
    expect((await post({ ...base, host: 'attacker.example' }, body)).shutdown).toBeUndefined();
  });

  it('비로컬 Host는 여전히 403', async () => {
    const res = await get(tempProject(), { host: 'attacker.example:4173' });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.json)).not.toContain('project');
  });
});

describe('포트와 실행 방식', () => {
  it('기본 포트는 4173~4192 스무 개', () => {
    expect(VIEWER_PORTS[0]).toBe(4173);
    expect(VIEWER_PORTS[VIEWER_PORTS.length - 1]).toBe(4192);
    expect(VIEWER_PORTS).toHaveLength(20);
  });

  it('EADDRINUSE와 EACCES만 다음 포트로 넘어간다', () => {
    expect(isSkippablePortError('EADDRINUSE')).toBe(true);
    expect(isSkippablePortError('EACCES')).toBe(true);
    expect(isSkippablePortError('EINVAL')).toBe(false);
    expect(isSkippablePortError(undefined)).toBe(false);
  });

  it('사용 중인 포트는 건너뛰고 다음 포트로 뜬다', async () => {
    const blocker = createServer();
    await new Promise<void>((r) => blocker.listen(0, '127.0.0.1', r));
    const busy = (blocker.address() as { port: number }).port;
    const site = tempProject({ 'index.html': 'ok' });
    try {
      const { server, port } = await startServer({ root: site, ports: [busy, 0], open: false });
      try {
        expect(port).not.toBe(busy);
      } finally {
        server.close();
      }
    } finally {
      blocker.close();
    }
  });

  it('--no-open이면 브라우저를 열지 않고, 인자가 없으면 연다', () => {
    expect(shouldOpenBrowser(['--no-open'])).toBe(false);
    expect(shouldOpenBrowser(['x', '--no-open'])).toBe(false);
    expect(shouldOpenBrowser([])).toBe(true);
    expect(shouldOpenBrowser(['--other'])).toBe(true);
  });
});
