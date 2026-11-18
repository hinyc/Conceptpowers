// @concept:human-owns-contract
// src/concept/viewerLink.ts — 개념 확정을 물을 때 쓸 뷰어 링크(viewer-link)와 뷰어 끄기(viewer-stop).
// 링크를 주거나 뷰어를 띄운 것은 사람의 확인이 아니다. 여기서는 개념의 상태·내용을 절대 바꾸지 않는다
// (쓰는 것은 render 산출물뿐). 뷰어를 열 수 없으면 {ok:false, reason}으로 이유를 알리고 호출한 쪽이 글로 이어 간다.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readProjectLocale } from '../init/readConfig.js';
import { viewerLinkStrings, type ViewerLinkStrings } from '../i18n/messages.js';
import { cpPaths } from '../paths.js';
import { readConcept } from '../store/conceptStore.js';
import { readProjectIdentity, VIEWER_PORTS } from '../viewer/projectIdentity.js';
import { renderViewerToDisk } from '../viewer/render.js';

export const HEALTH_REQUEST_TIMEOUT_MS = 800; // 포트 하나의 /api/health 응답 제한
export const VIEWER_START_TIMEOUT_MS = 10_000; // 시작 요청부터 준비 확인까지 전체 제한
export const VIEWER_POLL_INTERVAL_MS = 100;
export const STOP_CONFIRM_TIMEOUT_MS = 3_000; // 종료 신호 뒤 꺼졌는지 확인하는 제한
export const VIEWER_SERVE_FLAG = '--no-open'; // 브라우저를 열지 않는다(사람의 확인은 링크가 아니라 사람이 한다)
const RECOVER_RETRY_MS = 20;
export const START_LOCK_STALE_MS = 30_000; // 이보다 오래된 시작 잠금은 버려진 것으로 본다

export type ViewerLinkResult =
  { ok: true; url: string; started: boolean; port: number } | { ok: false; reason: string };

export interface ViewerStopResult {
  ok: true;
  stopped: number[];
}

// 테스트가 사용자 뷰어 포트를 건드리지 않도록 바꿀 수 있는 값들.
export interface ViewerLinkOptions {
  ports?: readonly number[];
  startTimeoutMs?: number;
  healthTimeoutMs?: number;
  pollIntervalMs?: number;
  lockDir?: string;
  serveScript?: string; // 기본: render가 복사한 프로젝트의 serve.mjs
}

export interface ViewerStopOptions {
  ports?: readonly number[];
  healthTimeoutMs?: number;
  confirmTimeoutMs?: number;
  pollIntervalMs?: number;
}

interface FoundViewer {
  port: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// 포트의 /api/health를 조회해 이 프로젝트 서버면 pid를 돌려준다. 다른 프로젝트·옛 서버(project 없음)·무응답은 null.
async function probePort(
  port: number,
  projectId: string,
  timeoutMs: number
): Promise<FoundViewer | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { project?: { id?: unknown } } | null;
    return body?.project?.id === projectId ? { port } : null;
  } catch {
    return null;
  }
}

async function findViewers(
  projectId: string,
  ports: readonly number[],
  timeoutMs: number
): Promise<FoundViewer[]> {
  const found = await Promise.all(ports.map((p) => probePort(p, projectId, timeoutMs)));
  return found.filter((f): f is FoundViewer => f !== null);
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function anyPortFree(ports: readonly number[]): Promise<boolean> {
  for (const port of ports) if (await isPortFree(port)) return true;
  return false;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// 프로젝트별 시작 잠금(mkdir은 원자적). 오래됐거나 주인 프로세스가 죽은 잠금은 복구한다. 제한 시간 안에 못 잡으면 null.
async function acquireLock(
  dir: string,
  deadline: number,
  intervalMs: number
): Promise<(() => Promise<void>) | null> {
  const owner = join(dir, 'owner');
  for (;;) {
    try {
      await mkdir(dir);
      await writeFile(owner, String(process.pid));
      return () => rm(dir, { recursive: true, force: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') return null;
    }
    if (await recoverStaleLock(dir, owner)) continue;
    if (Date.now() >= deadline) return null;
    await sleep(intervalMs);
  }
}

// 오래된 잠금 복구. 복구 자체도 mkdir 잠금(<잠금>.recover)을 잡은 한 쪽만 하고, 잡은 뒤 다시 오래됐는지 확인해
// 고유 이름으로 옮긴(rename, 원자적) 다음 지운다 — 경쟁하는 복구가 다른 호출이 방금 잡은 새 잠금을 지우지 않는다.
// 반환: 다시 시도해야 하면 true(복구했거나 다른 쪽이 복구 중), 잠금이 살아 있으면 false.
async function recoverStaleLock(dir: string, owner: string): Promise<boolean> {
  if (!(await isStaleLock(dir, owner))) return false;
  const guard = `${dir}.recover`;
  try {
    await mkdir(guard);
  } catch {
    // 다른 쪽이 복구 중이다. 복구하다 죽어 남은 오래된 가드만 치운다.
    const age = await stat(guard).then(
      (st) => Date.now() - st.mtimeMs,
      () => 0
    );
    if (age > START_LOCK_STALE_MS) await rm(guard, { recursive: true, force: true });
    await sleep(RECOVER_RETRY_MS);
    return true;
  }
  try {
    if (await isStaleLock(dir, owner)) {
      const claimed = `${dir}.stale-${process.pid}-${randomUUID()}`;
      await rename(dir, claimed).catch(() => undefined);
      await rm(claimed, { recursive: true, force: true });
    }
  } finally {
    await rm(guard, { recursive: true, force: true });
  }
  return true;
}

async function isStaleLock(dir: string, owner: string): Promise<boolean> {
  try {
    const age = Date.now() - (await stat(dir)).mtimeMs;
    if (age > START_LOCK_STALE_MS) return true;
    const pid = Number(await readFile(owner, 'utf8'));
    return Number.isInteger(pid) && pid > 0 && !isAlive(pid);
  } catch {
    // owner를 아직 못 쓴 찰나이거나 이미 사라진 잠금 — 오래되기 전까지는 살아 있는 것으로 둔다.
    return false;
  }
}

function lockPath(projectId: string, lockDir?: string): string {
  return join(lockDir ?? tmpdir(), `conceptpowers-viewer-${projectId}.lock`);
}

function buildUrl(port: number, slug: string | undefined): string {
  const base = `http://localhost:${port}/concepts/viewer/index.html`;
  return slug ? `${base}#/concept/${encodeURIComponent(slug)}` : base;
}

type StartOutcome = { port: number } | { failure: 'startFailed' | 'startTimeout' };

// 분리 프로세스로 뷰어를 띄우고 준비될 때까지 기다린다. 자식이 먼저 끝나면 바로 실패로 본다.
async function launchAndWait(
  root: string,
  projectId: string,
  ports: readonly number[],
  o: Required<Pick<ViewerLinkOptions, 'startTimeoutMs' | 'healthTimeoutMs' | 'pollIntervalMs'>>,
  script: string,
  deadline: number
): Promise<StartOutcome> {
  let exited = false;
  let child: ChildProcess;
  try {
    child = spawn(process.execPath, [script, VIEWER_SERVE_FLAG], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: root,
    });
  } catch {
    return { failure: 'startFailed' };
  }
  child.once('exit', () => {
    exited = true;
  });
  child.once('error', () => {
    exited = true;
  });
  child.unref();
  while (Date.now() < deadline) {
    const [mine] = await findViewers(projectId, ports, o.healthTimeoutMs);
    if (mine) return { port: mine.port };
    if (exited) return { failure: 'startFailed' };
    await sleep(o.pollIntervalMs);
  }
  // 시간 초과: 더 이상 아무도 기다리지 않을 서버를 남기지 않는다.
  if (child.pid && !exited) {
    try {
      process.kill(child.pid, 'SIGTERM');
    } catch {
      /* 이미 종료됨 */
    }
  }
  return { failure: 'startTimeout' };
}

interface LinkSettings {
  ports: readonly number[];
  startTimeoutMs: number;
  healthTimeoutMs: number;
  pollIntervalMs: number;
  deadline: number;
}

const linkOk = (port: number, slug: string | undefined, started: boolean): ViewerLinkResult => ({
  ok: true,
  url: buildUrl(port, slug),
  started,
  port,
});

// 잠금을 잡은 뒤: 기다리는 동안 다른 호출이 띄웠는지 다시 보고, 없으면 실제로 띄운다.
async function startUnderLock(
  root: string,
  id: string,
  slug: string | undefined,
  t: ViewerLinkStrings,
  cfg: LinkSettings,
  opts: ViewerLinkOptions
): Promise<ViewerLinkResult> {
  const raced = (await findViewers(id, cfg.ports, cfg.healthTimeoutMs))[0];
  if (raced) return linkOk(raced.port, slug, false);
  if (!(await anyPortFree(cfg.ports))) return { ok: false, reason: t.portsExhausted };
  const script = opts.serveScript ?? join(cpPaths(root).conceptsViewer, 'serve.mjs');
  const outcome = await launchAndWait(root, id, cfg.ports, cfg, script, cfg.deadline);
  if ('failure' in outcome) return { ok: false, reason: t[outcome.failure] };
  return linkOk(outcome.port, slug, true);
}

export async function viewerLink(
  root: string,
  slug: string | undefined,
  opts: ViewerLinkOptions = {}
): Promise<ViewerLinkResult> {
  const t = viewerLinkStrings[await readProjectLocale(root)];
  const startTimeoutMs = opts.startTimeoutMs ?? VIEWER_START_TIMEOUT_MS;
  const cfg: LinkSettings = {
    ports: opts.ports ?? VIEWER_PORTS,
    startTimeoutMs,
    healthTimeoutMs: opts.healthTimeoutMs ?? HEALTH_REQUEST_TIMEOUT_MS,
    pollIntervalMs: opts.pollIntervalMs ?? VIEWER_POLL_INTERVAL_MS,
    deadline: Date.now() + startTimeoutMs,
  };
  try {
    if (slug !== undefined && (await readConcept(root, slug)) === null) {
      return { ok: false, reason: t.conceptNotFound(slug) };
    }
    try {
      await renderViewerToDisk(root);
    } catch {
      return { ok: false, reason: t.renderFailed };
    }
    const { id } = readProjectIdentity(root);
    const existing = (await findViewers(id, cfg.ports, cfg.healthTimeoutMs))[0];
    if (existing) return linkOk(existing.port, slug, false);
    const release = await acquireLock(lockPath(id, opts.lockDir), cfg.deadline, cfg.pollIntervalMs);
    if (!release) return { ok: false, reason: t.lockTimeout };
    try {
      return await startUnderLock(root, id, slug, t, cfg, opts);
    } finally {
      await release();
    }
  } catch {
    return { ok: false, reason: t.startFailed };
  }
}

// 같은 id 서버에 끄기 요청(POST /api/shutdown)을 보낸다. 응답에서 받은 값으로 어떤 프로세스에도 신호를 보내지 않는다.
async function requestShutdown(port: number, projectId: string, timeoutMs: number): Promise<void> {
  const origin = `http://localhost:${port}`;
  try {
    await fetch(`${origin}/api/shutdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ projectId }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    /* 응답 없이 닫혔을 수 있다 — 아래 확인이 판단한다 */
  }
}

// 이 프로젝트의 뷰어를 모두 끈다. 다른 프로젝트·옛 서버(project 없음)는 건드리지 않는다.
export async function viewerStop(
  root: string,
  opts: ViewerStopOptions = {}
): Promise<ViewerStopResult> {
  const ports = opts.ports ?? VIEWER_PORTS;
  const healthTimeoutMs = opts.healthTimeoutMs ?? HEALTH_REQUEST_TIMEOUT_MS;
  const confirmTimeoutMs = opts.confirmTimeoutMs ?? STOP_CONFIRM_TIMEOUT_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? 50;
  const { id } = readProjectIdentity(root);
  const targets = await findViewers(id, ports, healthTimeoutMs);
  const stopped: number[] = [];
  for (const { port } of targets) {
    await requestShutdown(port, id, healthTimeoutMs);
    const deadline = Date.now() + confirmTimeoutMs;
    while (Date.now() < deadline && (await probePort(port, id, healthTimeoutMs))) {
      await sleep(pollIntervalMs);
    }
    if (!(await probePort(port, id, healthTimeoutMs))) stopped.push(port);
  }
  return { ok: true, stopped };
}
