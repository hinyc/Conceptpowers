import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { isNewer } from "./compareSemver.js";

export interface UpdateInfo {
  installed: string;
  latest: string;
}

export interface CheckOpts {
  fetchImpl?: typeof fetch;
  cacheDir?: string;
  now?: number;
  ttlMs?: number;
  url?: string;
  timeoutMs?: number;
}

const DEFAULT_URL =
  "https://raw.githubusercontent.com/hinyc/Conceptpowers/main/.claude-plugin/plugin.json";
const DEFAULT_TTL = 86_400_000; // 24h
const DEFAULT_TIMEOUT = 1500;
const CACHE_FILE = "update-check.json";

function defaultCacheDir(): string {
  return process.env.CONCEPTPOWERS_CACHE_DIR ?? join(homedir(), ".cache", "conceptpowers");
}

// 설치된 plugin.json에서 version 읽기. 실패 시 null.
async function readInstalledVersion(pluginRoot: string): Promise<string | null> {
  try {
    const text = await readFile(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8");
    const v = JSON.parse(text)?.version;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

interface CacheShape {
  checkedAt: number;
  latest: string;
}

async function readCache(cacheDir: string): Promise<CacheShape | null> {
  try {
    const text = await readFile(join(cacheDir, CACHE_FILE), "utf8");
    const data = JSON.parse(text);
    if (typeof data?.checkedAt === "number" && typeof data?.latest === "string") {
      return { checkedAt: data.checkedAt, latest: data.latest };
    }
    return null;
  } catch {
    return null;
  }
}

// 캐시 쓰기 실패는 무시(최적화일 뿐).
async function writeCache(cacheDir: string, cache: CacheShape): Promise<void> {
  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(join(cacheDir, CACHE_FILE), JSON.stringify(cache));
  } catch {
    // best-effort
  }
}

// 원격 plugin.json의 version을 가져온다. 실패/타임아웃/비200/누락 → null.
async function fetchLatest(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) return null;
    const v = (await res.json())?.version;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkForUpdate(
  pluginRoot: string,
  opts: CheckOpts = {},
): Promise<UpdateInfo | null> {
  const installed = await readInstalledVersion(pluginRoot);
  if (!installed) return null;

  const now = opts.now ?? Date.now();
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL;
  const cacheDir = opts.cacheDir ?? defaultCacheDir();

  let latest: string | null = null;
  const cached = await readCache(cacheDir);
  if (cached && now - cached.checkedAt < ttlMs) {
    latest = cached.latest;
  } else {
    latest = await fetchLatest(
      opts.fetchImpl ?? fetch,
      opts.url ?? DEFAULT_URL,
      opts.timeoutMs ?? DEFAULT_TIMEOUT,
    );
    if (latest) await writeCache(cacheDir, { checkedAt: now, latest });
  }

  if (!latest) return null;
  return isNewer(latest, installed) ? { installed, latest } : null;
}
