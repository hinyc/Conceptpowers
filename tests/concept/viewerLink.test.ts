// @concept:human-owns-contract
// tests/concept/viewerLink.test.ts
// 검증 대상 규칙 ↔ 시나리오:
//  - 허용 "사람에게 개념 확정을 물을 때, 그 개념을 바로 열어 볼 수 있는 링크를 함께 주는 것"
//    → 뷰어가 있으면 재사용, 없으면 브라우저 없이 새로 실행하고 개념 링크를 준다 / slug가 없으면 첫 화면 링크
//    → 같은 프로젝트는 심볼릭 경로로 들어와도 같은 서버, 다른 프로젝트·project 없는 옛 서버는 무시
//    → 동시에 불러도 같은 프로젝트 서버는 하나, CLI가 끝나도 서버는 살아 있다
//  - 불변 "링크를 보여주거나 뷰어를 띄운 것은 사람의 확인으로 치지 않는다"
//    → 링크·실행·종료 모두 개념의 상태와 내용을 바꾸지 않는다
//  - 불변 "뷰어를 열 수 없으면 이유를 알리고, 확인은 글로 이어 간다"
//    → 없는 slug·포트 소진·조기 종료·시간 초과는 {ok:false, reason}(프로젝트 언어, 경로 비노출), CLI는 exit 0
// 실제 프로세스는 임시 프로젝트의 가짜 뷰어(주입한 포트)로 띄우고 afterEach에서 반드시 종료한다 — 사용자 뷰어 포트는 건드리지 않는다.
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createServer as createNetServer, type Socket, type Server as NetServer } from 'node:net';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { runCli } from '../../src/cli.js';
import { viewerLink, viewerStop } from '../../src/concept/viewerLink.js';
import { readProjectIdentity } from '../../src/viewer/projectIdentity.js';
import { writeConcept, readConcept } from '../../src/store/conceptStore.js';

const repoRoot = resolve(__dirname, '../..');
const tempDirs: string[] = [];
const tempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

// 가짜 뷰어: 진짜 serve.mjs와 같은 /api/health 계약만 흉내 낸다. 포트·id·동작은 환경변수로 받는다.
const FAKE_VIEWER = `
import http from 'node:http';
import { appendFileSync } from 'node:fs';
const { FAKE_PORT, FAKE_ID, FAKE_MODE = 'ok', FAKE_LOG, FAKE_PIDS } = process.env;
if (FAKE_PIDS) appendFileSync(FAKE_PIDS, process.pid + '\\n');
if (FAKE_LOG) appendFileSync(FAKE_LOG, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), pid: process.pid }) + '\\n');
if (FAKE_MODE === 'exit') process.exit(1);
if (FAKE_MODE === 'never') setInterval(() => {}, 1000);
else {
  http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST' && req.url === '/api/shutdown') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const same = JSON.parse(body || '{}').projectId === FAKE_ID;
        res.statusCode = same ? 200 : 403;
        res.end('{}', () => { if (same && FAKE_MODE !== 'ignore') process.exit(0); });
      });
      return;
    }
    res.end(JSON.stringify({ editable: true, transitions: {}, project: { id: FAKE_ID, name: 'fake' } }));
  }).listen(Number(FAKE_PORT), '127.0.0.1');
}
`;

const ENV_KEYS = ['FAKE_PORT', 'FAKE_ID', 'FAKE_MODE', 'FAKE_LOG'] as const;
const servers: Server[] = [];
const netServers: NetServer[] = [];
const sockets: Socket[] = [];
const usedPorts: number[] = [];

async function freePorts(n: number): Promise<number[]> {
  const holders = await Promise.all(
    Array.from(
      { length: n },
      () =>
        new Promise<NetServer>((res) => {
          const s = createNetServer();
          s.listen(0, '127.0.0.1', () => res(s));
        })
    )
  );
  const ports = holders.map((s) => (s.address() as { port: number }).port);
  await Promise.all(holders.map((s) => new Promise((r) => s.close(r))));
  usedPorts.push(...ports);
  return ports;
}

async function isUp(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(500),
    });
    return ((await res.json()) as { project?: unknown }).project !== undefined;
  } catch {
    return false;
  }
}

const pidList = (): number[] =>
  readFileSync(pidsFile, 'utf8').split('\n').filter(Boolean).map(Number);

function startFake(port: number, body: unknown): Promise<void> {
  return new Promise((res) => {
    const s = createServer((_q, r) => {
      r.setHeader('Content-Type', 'application/json');
      r.end(JSON.stringify(body));
    });
    servers.push(s);
    s.listen(port, '127.0.0.1', () => res());
  });
}

function occupy(port: number): Promise<void> {
  return new Promise((res) => {
    const s = createNetServer((sock) => sockets.push(sock));
    netServers.push(s);
    s.listen(port, '127.0.0.1', () => res());
  });
}

let fakeScript: string;
let pidsFile: string;
let lockDir: string;
beforeAll(() => {
  fakeScript = join(tempDir('cp-vl-fake-'), 'fake-viewer.mjs');
  writeFileSync(fakeScript, FAKE_VIEWER);
  pidsFile = join(tempDir('cp-vl-pids-'), 'pids');
  writeFileSync(pidsFile, '');
  process.env.FAKE_PIDS = pidsFile;
});
afterAll(() => {
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
});

async function makeProject(locale: 'ko' | 'en' = 'ko'): Promise<string> {
  const root = realpathSync(tempDir('cp-vl-proj-'));
  await runCli(['init', '--root', root, '--lang', locale], () => {});
  await writeConcept(root, {
    slug: 'sample-rule',
    category: ['behavior'],
    title: '샘플',
    description: { definition: 'd' },
    purpose: { reason: 'r' },
    actions: {},
    principle: {},
    status: 'red',
  } as never);
  return root;
}

function fakeEnv(root: string, port: number, mode = 'ok', log?: string): void {
  process.env.FAKE_PORT = String(port);
  process.env.FAKE_ID = readProjectIdentity(root).id;
  process.env.FAKE_MODE = mode;
  if (log) process.env.FAKE_LOG = log;
}

const fast = { startTimeoutMs: 5000, healthTimeoutMs: 300, pollIntervalMs: 30 };

beforeAll(() => {
  lockDir = tempDir('cp-vl-lock-');
});

afterEach(async () => {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const pid of pidList()) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* 이미 종료 */
    }
  }
  writeFileSync(pidsFile, '');
  usedPorts.length = 0;
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
  sockets.splice(0).forEach((x) => x.destroy());
  await Promise.all(netServers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

describe('viewer-link — 재사용·실행·링크 형식', () => {
  it('이 프로젝트 뷰어가 이미 있으면 새로 띄우지 않고 그대로 쓴다 (started:false, 개념 링크)', async () => {
    const root = await makeProject();
    const [port] = await freePorts(1);
    await startFake(port, { project: { id: readProjectIdentity(root).id, name: 'x' } });
    const r = await viewerLink(root, 'sample-rule', { ...fast, ports: [port], lockDir });
    expect(r).toEqual({
      ok: true,
      url: `http://localhost:${port}/concepts/viewer/index.html#/concept/sample-rule`,
      started: false,
      port,
    });
  });

  it('없으면 브라우저 없이(--no-open) 분리 프로세스로 새로 띄우고 started:true, slug 없으면 # 없는 링크', async () => {
    const root = await makeProject();
    const [port] = await freePorts(1);
    const log = join(tempDir('cp-vl-log-'), 'log.jsonl');
    fakeEnv(root, port, 'ok', log);
    const r = await viewerLink(root, undefined, {
      ...fast,
      ports: [port],
      lockDir,
      serveScript: fakeScript,
    });
    expect(r).toEqual({
      ok: true,
      url: `http://localhost:${port}/concepts/viewer/index.html`,
      started: true,
      port,
    });
    const entry = JSON.parse(readFileSync(log, 'utf8').trim());
    expect(entry.argv).toEqual(['--no-open']);
    expect(realpathSync(entry.cwd)).toBe(root);
    expect(await isUp(port)).toBe(true);
    expect(pidList()).toEqual([entry.pid]);
    // 이어서 부르면 재사용
    const again = await viewerLink(root, 'sample-rule', {
      ...fast,
      ports: [port],
      lockDir,
      serveScript: fakeScript,
    });
    expect(again).toMatchObject({ ok: true, started: false, port });
  });

  it('기본 서버 실행 파일은 render가 복사한 프로젝트의 serve.mjs이고, render로 뷰어를 최신으로 만든다', async () => {
    const root = await makeProject();
    const [port] = await freePorts(1);
    await startFake(port, { project: { id: readProjectIdentity(root).id } });
    await viewerLink(root, 'sample-rule', { ...fast, ports: [port], lockDir });
    expect(existsSync(join(root, 'docs/conceptpowers/concepts/viewer/serve.mjs'))).toBe(true);
    expect(existsSync(join(root, 'docs/conceptpowers/concepts/viewer/index.html'))).toBe(true);
  });
});

describe('viewer-link — 프로젝트 구별', () => {
  it('다른 프로젝트 서버·project 없는 옛 서버·응답 없는 포트는 무시하고 새로 띄운다', async () => {
    const root = await makeProject();
    const [other, old, dead, mine] = await freePorts(4);
    await startFake(other, { project: { id: 'ffffffffffffffff', name: 'o' } });
    await startFake(old, { editable: true, transitions: {} });
    fakeEnv(root, mine);
    const r = await viewerLink(root, 'sample-rule', {
      ...fast,
      ports: [other, old, dead, mine],
      lockDir,
      serveScript: fakeScript,
    });
    expect(r).toMatchObject({ ok: true, started: true, port: mine });
  });

  it('심볼릭 링크 경로로 들어와도 같은 프로젝트의 서버를 찾는다', async () => {
    const root = await makeProject();
    const link = join(tempDir('cp-vl-link-'), 'alias');
    symlinkSync(root, link);
    const [port] = await freePorts(1);
    await startFake(port, { project: { id: readProjectIdentity(root).id, name: 'x' } });
    const r = await viewerLink(link, 'sample-rule', { ...fast, ports: [port], lockDir });
    expect(r).toMatchObject({ ok: true, started: false, port });
  });
});

describe('viewer-link — 실패는 {ok:false, reason}', () => {
  it('없는 slug는 실패하고 뷰어를 만들지도 띄우지도 않는다 (ko)', async () => {
    const root = await makeProject('ko');
    const [port] = await freePorts(1);
    const log = join(tempDir('cp-vl-log-'), 'log.jsonl');
    fakeEnv(root, port, 'ok', log);
    const r = await viewerLink(root, 'no-such', {
      ...fast,
      ports: [port],
      lockDir,
      serveScript: fakeScript,
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('no-such');
    expect(!r.ok && r.reason).toMatch(/[가-힣]/);
    expect(existsSync(log)).toBe(false);
  });

  it('프로젝트 언어가 en이면 영어 문구', async () => {
    const root = await makeProject('en');
    const r = await viewerLink(root, 'no-such', { ...fast, ports: [], lockDir });
    expect(!r.ok && r.reason).toMatch(/not found/i);
  });

  it('포트가 모두 차 있으면 띄우지 않고 이유를 알린다', async () => {
    const root = await makeProject('en');
    const ports = await freePorts(2);
    await Promise.all(ports.map(occupy));
    const log = join(tempDir('cp-vl-log-'), 'log.jsonl');
    fakeEnv(root, ports[0], 'ok', log);
    const r = await viewerLink(root, 'sample-rule', {
      ...fast,
      ports,
      lockDir,
      serveScript: fakeScript,
    });
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/port/i) });
    expect(existsSync(log)).toBe(false);
  });

  it('자식이 먼저 종료하면 제한 시간을 기다리지 않고 실패한다', async () => {
    const root = await makeProject('en');
    const [port] = await freePorts(1);
    fakeEnv(root, port, 'exit');
    const t0 = Date.now();
    const r = await viewerLink(root, 'sample-rule', {
      ...fast,
      ports: [port],
      lockDir,
      serveScript: fakeScript,
    });
    expect(r.ok).toBe(false);
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(!r.ok && r.reason).toMatch(/exited/i);
  });

  it('준비되지 않으면 제한 시간 뒤 실패하고, 남은 자식을 정리하며, 경로를 노출하지 않는다', async () => {
    const root = await makeProject('en');
    const [port] = await freePorts(1);
    const log = join(tempDir('cp-vl-log-'), 'log.jsonl');
    fakeEnv(root, port, 'never', log);
    const r = await viewerLink(root, 'sample-rule', {
      ...fast,
      startTimeoutMs: 700,
      ports: [port],
      lockDir,
      serveScript: fakeScript,
    });
    expect(r.ok).toBe(false);
    const reason = !r.ok ? r.reason : '';
    expect(reason).toMatch(/time limit/i);
    expect(reason).not.toContain(root);
    expect(reason).not.toContain(tmpdir());
    const pid = JSON.parse(readFileSync(log, 'utf8').trim()).pid;
    await new Promise((res) => setTimeout(res, 200));
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it('render가 실패하면 이유만 알린다 (원본 오류·경로 없음)', async () => {
    const root = await makeProject('en');
    // 뷰어 폴더 자리에 파일을 둬서 복사를 실패시킨다
    rmSync(join(root, 'docs/conceptpowers/concepts/viewer'), { recursive: true, force: true });
    writeFileSync(join(root, 'docs/conceptpowers/concepts/viewer'), 'x');
    const r = await viewerLink(root, 'sample-rule', { ...fast, ports: [], lockDir });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).not.toContain(root);
  });

  it('개념의 상태·내용은 링크·실행 전후로 같다', async () => {
    const root = await makeProject();
    const file = join(root, 'docs/conceptpowers/concepts/data');
    const before = JSON.stringify(await readConcept(root, 'sample-rule'));
    const raw = spawnSync('find', [file, '-type', 'f'], { encoding: 'utf8' }).stdout;
    const [port] = await freePorts(1);
    fakeEnv(root, port);
    await viewerLink(root, 'sample-rule', {
      ...fast,
      ports: [port],
      lockDir,
      serveScript: fakeScript,
    });
    expect(JSON.stringify(await readConcept(root, 'sample-rule'))).toBe(before);
    expect(spawnSync('find', [file, '-type', 'f'], { encoding: 'utf8' }).stdout).toBe(raw);
    expect((await readConcept(root, 'sample-rule'))?.status).toBe('red');
  });
});

describe('viewer-link — 시작 잠금', () => {
  it('오래된 잠금을 동시에 복구해도 서버는 하나만 뜬다 (복구는 원자적 rename을 이긴 쪽만)', async () => {
    const root = await makeProject();
    const [port] = await freePorts(1);
    const dir = tempDir('cp-vl-race-');
    const lock = join(dir, `conceptpowers-viewer-${readProjectIdentity(root).id}.lock`);
    mkdirSync(lock);
    writeFileSync(join(lock, 'owner'), '2147483646');
    fakeEnv(root, port);
    const rs = await Promise.all(
      Array.from({ length: 6 }, () =>
        viewerLink(root, undefined, {
          ...fast,
          ports: [port],
          lockDir: dir,
          serveScript: fakeScript,
        })
      )
    );
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(rs.filter((r) => r.ok && r.started)).toHaveLength(1);
    expect(pidList()).toHaveLength(1);
  });

  it('주인이 죽은 잠금·오래된 잠금은 복구하고 뷰어를 띄운다', async () => {
    const root = await makeProject();
    const [port] = await freePorts(1);
    fakeEnv(root, port);
    const dir = tempDir('cp-vl-stale-');
    const lock = join(dir, `conceptpowers-viewer-${readProjectIdentity(root).id}.lock`);
    mkdirSync(lock);
    writeFileSync(join(lock, 'owner'), '2147483646');
    const r = await viewerLink(root, undefined, {
      ...fast,
      ports: [port],
      lockDir: dir,
      serveScript: fakeScript,
    });
    expect(r).toMatchObject({ ok: true, started: true });
    // 오래된(주인 불명) 잠금
    await viewerStop(root, { ports: [port], healthTimeoutMs: 300 });
    mkdirSync(lock);
    writeFileSync(join(lock, 'owner'), String(process.pid));
    const old = new Date(Date.now() - 120_000);
    utimesSync(lock, old, old);
    const r2 = await viewerLink(root, undefined, {
      ...fast,
      ports: [port],
      lockDir: dir,
      serveScript: fakeScript,
    });
    expect(r2).toMatchObject({ ok: true, started: true });
  });

  it('살아 있는 잠금을 제한 시간 안에 못 잡으면 이유를 알린다', async () => {
    const root = await makeProject('en');
    const [port] = await freePorts(1);
    const dir = tempDir('cp-vl-held-');
    const lock = join(dir, `conceptpowers-viewer-${readProjectIdentity(root).id}.lock`);
    mkdirSync(lock);
    writeFileSync(join(lock, 'owner'), String(process.pid));
    const r = await viewerLink(root, undefined, {
      ...fast,
      startTimeoutMs: 400,
      ports: [port],
      lockDir: dir,
      serveScript: fakeScript,
    });
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/waiting/i) });
  });
});

// 별도 프로세스에서 viewerLink를 부르는 진입점(CLI와 같은 종료 방식) — 부른 프로세스가 끝나도 서버가 사는지 본다.
let helperDir: string;
let helperJs: string;
let cliJs: string;
beforeAll(async () => {
  helperDir = tempDir('cp-vl-helper-');
  const entry = join(helperDir, 'entry.ts');
  writeFileSync(
    entry,
    `import { viewerLink } from ${JSON.stringify(join(repoRoot, 'src/concept/viewerLink.ts'))};\n` +
      `const [root, port, script, lockDir] = process.argv.slice(2);\n` +
      `viewerLink(root, 'sample-rule', { ports: [Number(port)], serveScript: script, lockDir, startTimeoutMs: 8000, pollIntervalMs: 30 })\n` +
      `  .then((r) => process.stdout.write(JSON.stringify(r), () => process.exit(0)));\n`
  );
  const banner = {
    js: [
      "import { createRequire as __cpCreateRequire } from 'node:module';",
      'const require = __cpCreateRequire(import.meta.url);',
    ].join('\n'),
  };
  await build({
    entryPoints: { entry, 'dist/cli': join(repoRoot, 'src/cli.ts') },
    outdir: helperDir,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    banner,
    logLevel: 'silent',
  });
  // 번들은 위치에서 위로 올라가며 assets/를 찾는다 — 저장소 에셋을 읽기 전용으로 연결한다.
  symlinkSync(join(repoRoot, 'assets'), join(helperDir, 'assets'));
  helperJs = join(helperDir, 'entry.js');
  cliJs = join(helperDir, 'dist', 'cli.js');
}, 60_000);

function runHelper(root: string, port: number, env: NodeJS.ProcessEnv) {
  return new Promise<string>((res, rej) => {
    execFile(
      process.execPath,
      [helperJs, root, String(port), fakeScript, lockDir],
      { env: { ...process.env, ...env }, maxBuffer: 1 << 24 },
      (e, stdout) => (e ? rej(e) : res(stdout))
    );
  });
}

describe('viewer-link — 실제 프로세스', () => {
  it('동시에 여러 프로세스가 불러도 같은 프로젝트 서버는 하나만 뜨고, 부른 프로세스가 끝나도 서버는 산다', async () => {
    const root = await makeProject();
    const [port] = await freePorts(1);
    const log = join(tempDir('cp-vl-log-'), 'log.jsonl');
    const env = {
      FAKE_PORT: String(port),
      FAKE_ID: readProjectIdentity(root).id,
      FAKE_MODE: 'ok',
      FAKE_LOG: log,
    };
    const outs = await Promise.all(Array.from({ length: 5 }, () => runHelper(root, port, env)));
    const results = outs.map((o) => JSON.parse(o));
    expect(results.every((r) => r.ok && r.port === port)).toBe(true);
    expect(results.filter((r) => r.started)).toHaveLength(1);
    expect(readFileSync(log, 'utf8').trim().split('\n')).toHaveLength(1);
    // 모든 호출자가 종료한 뒤에도 서버가 응답한다
    const pid = JSON.parse(readFileSync(log, 'utf8').trim()).pid;
    expect(await isUp(port)).toBe(true);
    expect(() => process.kill(pid, 0)).not.toThrow();
  });
});

describe('viewer-stop', () => {
  it('이 프로젝트 서버만 종료하고 다른 프로젝트·옛 서버는 건드리지 않는다', async () => {
    const mine = await makeProject();
    const other = await makeProject();
    const [pMine, pOther, pOld] = await freePorts(3);
    fakeEnv(mine, pMine);
    await viewerLink(mine, undefined, {
      ...fast,
      ports: [pMine],
      lockDir,
      serveScript: fakeScript,
    });
    fakeEnv(other, pOther);
    await viewerLink(other, undefined, {
      ...fast,
      ports: [pOther],
      lockDir,
      serveScript: fakeScript,
    });
    await startFake(pOld, { editable: true });
    const stopped = await viewerStop(mine, { ports: [pMine, pOther, pOld], healthTimeoutMs: 300 });
    expect(stopped).toEqual({ ok: true, stopped: [pMine] });
    expect(await isUp(pMine)).toBe(false);
    expect(await isUp(pOther)).toBe(true);
    expect(servers.every((x) => x.listening)).toBe(true); // project 없는 옛 서버는 건드리지 않는다
    expect(servers.every((s) => s.listening)).toBe(true);
  });

  it('없으면 stopped: []', async () => {
    const root = await makeProject();
    const [port] = await freePorts(1);
    expect(await viewerStop(root, { ports: [port], healthTimeoutMs: 200 })).toEqual({
      ok: true,
      stopped: [],
    });
  });
});

describe('viewer-stop — 신호 없이 서버 스스로 닫는다', () => {
  it('같은 id를 내세우는 위조 서버가 있어도 어떤 프로세스에도 신호를 보내지 않는다 (제3 프로세스 생존)', async () => {
    const root = await makeProject();
    const [port] = await freePorts(1);
    // 제3 프로세스: 이 프로젝트와 무관하게 살아 있어야 한다
    const bystander = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    });
    try {
      fakeEnv(root, port, 'ignore'); // 끄기 요청을 무시하는 위조 서버(응답에 pid 없음)
      await viewerLink(root, undefined, {
        ...fast,
        ports: [port],
        lockDir,
        serveScript: fakeScript,
      });
      const r = await viewerStop(root, {
        ports: [port],
        healthTimeoutMs: 200,
        confirmTimeoutMs: 400,
      });
      expect(r).toEqual({ ok: true, stopped: [] }); // 응답이 사라지지 않았으므로 꺼진 것으로 세지 않는다
      expect(() => process.kill(bystander.pid as number, 0)).not.toThrow();
    } finally {
      bystander.kill('SIGKILL');
    }
  });

  it('실제 서버: 같은 id만 끄고, 다른 id·교차 출처 요청은 거부하며, 끄면 서버가 닫히고 종료 콜백이 불린다', async () => {
    const root = await makeProject();
    const [port] = await freePorts(1);
    let closed = false;
    const { startServer } = await import('../../src/viewer/serve.js');
    const { server } = await startServer({
      root: join(root, 'docs/conceptpowers'),
      projectRoot: root,
      ports: [port],
      onShutdown: () => {
        closed = true;
      },
    });
    const id = readProjectIdentity(root).id;
    const post = (body: unknown, headers: Record<string, string>) =>
      fetch(`http://127.0.0.1:${port}/api/shutdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    const origin = `http://127.0.0.1:${port}`;
    expect((await post({ projectId: 'other' }, { Origin: origin })).status).toBe(403);
    expect((await post({ projectId: id }, { Origin: 'http://evil.example' })).status).toBe(403);
    expect((await post({ projectId: id }, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect(server.listening).toBe(true);
    const health = (await (await fetch(`${origin}/api/health`)).json()) as { project: object };
    expect(Object.keys(health.project).sort()).toEqual(['id', 'name']);
    const r = await viewerStop(root, { ports: [port], healthTimeoutMs: 300 });
    expect(r).toEqual({ ok: true, stopped: [port] });
    expect(server.listening).toBe(false);
    await new Promise((res) => setTimeout(res, 50));
    expect(closed).toBe(true);
  });
});

describe('CLI', () => {
  it('viewer-link는 실패해도 exit 0이고 JSON {ok:false, reason}을 낸다', async () => {
    const root = await makeProject('en');
    let out = '';
    const code = await runCli(['viewer-link', 'no-such', '--root', root], (s) => (out += s));
    expect(code).toBe(0);
    expect(JSON.parse(out)).toMatchObject({ ok: false });
  });

  it('viewer-stop은 뷰어가 없어도 exit 0 {ok:true, stopped:[]} (사용자 포트를 건드리지 않도록 다른 프로젝트 id만 본다)', async () => {
    const root = await makeProject();
    let out = '';
    const code = await runCli(['viewer-stop', '--root', root], (s) => (out += s));
    expect(code).toBe(0);
    expect(JSON.parse(out)).toMatchObject({ ok: true });
  });

  it('init 전 프로젝트는 다른 명령처럼 거부된다', async () => {
    const root = tempDir('cp-vl-noinit-');
    let out = '';
    expect(await runCli(['viewer-link', '--root', root], (s) => (out += s))).toBe(1);
    expect(JSON.parse(out).error).toMatch(/not initialized/);
  });

  it('파이프 stdout은 64KB를 넘어도 끝까지 전달된다 (배포 번들로 실행)', async () => {
    const root = await makeProject('en');
    const slug = 'x'.repeat(100_000);
    const stdout = await new Promise<string>((res, rej) => {
      execFile(
        process.execPath,
        [cliJs, 'viewer-link', slug, '--root', root],
        { maxBuffer: 1 << 24 },
        (e, o) => (e ? rej(e) : res(o))
      );
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toContain(slug);
  });
});
