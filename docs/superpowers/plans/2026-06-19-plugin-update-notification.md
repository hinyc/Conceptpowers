# 플러그인 새 버전 알림 (SessionStart 내장) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** conceptpowers 활성 프로젝트의 세션 시작 시, GitHub에 설치 버전보다 높은 버전이 있으면 사용자에게 한 줄로 알린다(best-effort, 옷아웃 가능).

**Architecture:** 순수 semver 비교 유틸 + best-effort 업데이트 조회 모듈(24h 캐시·1.5s 타임아웃·실패 시 null)을 만들고, 기존 `sessionStart` 훅이 이를 호출해 `<CONCEPTPOWERS-UPDATE>` 블록을 `additionalContext`에 주입한다. 기존 `<CONCEPT-DRIFT>` best-effort 패턴을 그대로 따른다.

**Tech Stack:** TypeScript(ESM), Node 18+ 전역 `fetch`/`AbortController`, zod, vitest.

## Global Constraints

- 불변 패턴만 사용(객체 변경 금지, 새 객체 생성).
- 작은 파일·단일 책임. 함수 <50줄.
- 포괄적 오류 처리. `checkForUpdate`는 **절대 throw하지 않음** — 모든 fs/네트워크/파싱 오류는 내부에서 잡아 `null` 반환.
- `console.log` 금지. 하드코딩 값은 상수로.
- 입력 검증은 zod(스키마 변경 시).
- 훅은 `dist/hooks/*.js`를 직접 실행 → 배포 전 `pnpm build` 필수.
- 테스트 커버리지 80%+. 테스트는 네트워크에 의존하지 않음(fetch 주입/모킹).
- fetch 출처 상수: `https://raw.githubusercontent.com/hinyc/Conceptpowers/main/.claude-plugin/plugin.json`
- 캐시 TTL: 24h(밀리초 `86_400_000`). 캐시 기본 경로: `CONCEPTPOWERS_CACHE_DIR` 환경변수 또는 `~/.cache/conceptpowers`.
- 옷아웃: init.json `versionCheck:false` 또는 환경변수 `CONCEPTPOWERS_NO_VERSION_CHECK`(값 존재 시 비활성).

## File Structure

- Create `src/version/compareSemver.ts` — 순수 semver 비교(`isNewer`).
- Create `src/version/checkUpdate.ts` — 설치 버전 읽기 + 캐시 + fetch + 비교 오케스트레이션(`checkForUpdate`).
- Create `tests/version/compareSemver.test.ts`, `tests/version/checkUpdate.test.ts`.
- Modify `src/schema/initConfig.ts` — `versionCheck` 필드 추가.
- Modify `tests/schema/initConfig.test.ts` — 기본값/명시값 검증.
- Modify `src/hooks/sessionStart.ts` — 옷아웃 게이트 + `checkForUpdate` 호출 + `<CONCEPTPOWERS-UPDATE>` 블록(의존성 주입 seam 추가).
- Modify `tests/hooks/sessionStart.test.ts` — 블록 주입/미주입/옷아웃 테스트(주입 stub).
- Modify `README.md`, `README.ko.md`(존재 시) — 동작·옷아웃 명시.
- Rebuild `dist/`.

---

### Task 1: semver 비교 유틸

**Files:**
- Create: `src/version/compareSemver.ts`
- Test: `tests/version/compareSemver.test.ts`

**Interfaces:**
- Consumes: 없음.
- Produces: `export function isNewer(remote: string, installed: string): boolean` — `remote`가 `installed`보다 높은 `x.y.z`이면 true. 둘 중 하나라도 `x.y.z` 형식이 아니면 false.

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/version/compareSemver.test.ts
import { describe, it, expect } from "vitest";
import { isNewer } from "../../src/version/compareSemver.js";

describe("isNewer", () => {
  it("major/minor/patch가 더 높으면 true", () => {
    expect(isNewer("1.0.0", "0.9.9")).toBe(true);
    expect(isNewer("0.2.0", "0.1.9")).toBe(true);
    expect(isNewer("0.1.1", "0.1.0")).toBe(true);
  });
  it("같거나 낮으면 false", () => {
    expect(isNewer("0.1.0", "0.1.0")).toBe(false);
    expect(isNewer("0.1.0", "0.2.0")).toBe(false);
    expect(isNewer("1.0.0", "2.0.0")).toBe(false);
  });
  it("형식이 아니면 false(안전 측)", () => {
    expect(isNewer("1.0", "0.9.9")).toBe(false);
    expect(isNewer("abc", "0.1.0")).toBe(false);
    expect(isNewer("1.0.0", "")).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- compareSemver`
Expected: FAIL ("isNewer" not exported / module not found)

- [ ] **Step 3: 최소 구현**

```typescript
// src/version/compareSemver.ts
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function parse(v: string): [number, number, number] | null {
  const m = SEMVER.exec(v);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// remote가 installed보다 높은 버전이면 true. 비-semver는 안전하게 false.
export function isNewer(remote: string, installed: string): boolean {
  const r = parse(remote);
  const i = parse(installed);
  if (!r || !i) return false;
  for (let k = 0; k < 3; k++) {
    if (r[k] > i[k]) return true;
    if (r[k] < i[k]) return false;
  }
  return false;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test -- compareSemver`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/version/compareSemver.ts tests/version/compareSemver.test.ts
git commit -m "feat: semver 비교 유틸 isNewer 추가"
```

---

### Task 2: init 설정에 versionCheck 옷아웃 필드

**Files:**
- Modify: `src/schema/initConfig.ts`
- Test: `tests/schema/initConfig.test.ts`

**Interfaces:**
- Consumes: 없음.
- Produces: `InitConfig`에 `versionCheck: boolean`(기본 `true`). `parseInitConfig`는 누락 시 `true`로 채운다.

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/schema/initConfig.test.ts`에 아래 테스트를 추가한다(기존 import 재사용).

```typescript
import { parseInitConfig } from "../../src/schema/initConfig.js";

describe("versionCheck", () => {
  const base = { version: "0.1.0", enabled: true } as const;
  it("누락 시 기본값 true", () => {
    expect(parseInitConfig({ ...base }).versionCheck).toBe(true);
  });
  it("false로 명시하면 false", () => {
    expect(parseInitConfig({ ...base, versionCheck: false }).versionCheck).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- initConfig`
Expected: FAIL (`versionCheck`가 `undefined`)

- [ ] **Step 3: 스키마에 필드 추가**

`src/schema/initConfig.ts`의 `InitConfigSchema` 객체에 `project` 위 줄로 추가:

```typescript
  versionCheck: z.boolean().default(true),
```

최종 형태:

```typescript
export const InitConfigSchema = z.object({
  version: z.string(),
  enabled: z.literal(true),
  backfillMode: z.enum(['incremental', 'strict']).default('incremental'),
  enforceScope: z.literal('new-feature-behavior').default('new-feature-behavior'),
  locale: LocaleSchema.default('ko'),
  versionCheck: z.boolean().default(true),
  project: z.object({ name: z.string().default(''), description: z.string().default('') }).default({})
})
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test -- initConfig`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/schema/initConfig.ts tests/schema/initConfig.test.ts
git commit -m "feat: init 설정에 versionCheck 옷아웃 필드 추가"
```

---

### Task 3: best-effort 업데이트 조회 모듈

**Files:**
- Create: `src/version/checkUpdate.ts`
- Test: `tests/version/checkUpdate.test.ts`

**Interfaces:**
- Consumes: `isNewer` (Task 1).
- Produces:
  - `export interface UpdateInfo { installed: string; latest: string }`
  - `export interface CheckOpts { fetchImpl?: typeof fetch; cacheDir?: string; now?: number; ttlMs?: number; url?: string; timeoutMs?: number }`
  - `export async function checkForUpdate(pluginRoot: string, opts?: CheckOpts): Promise<UpdateInfo | null>` — 설치 버전을 읽고, 캐시 또는 fetch로 최신 버전을 구해 더 높으면 `{installed, latest}` 반환, 아니면 `null`. **절대 throw 안 함.**

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// tests/version/checkUpdate.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkForUpdate } from "../../src/version/checkUpdate.js";

// 설치된 plugin.json(.claude-plugin/plugin.json)을 가진 가짜 pluginRoot 생성
function makePluginRoot(installed: string): string {
  const root = mkdtempSync(join(tmpdir(), "cp-plugin-"));
  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(root, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "conceptpowers", version: installed }),
  );
  return root;
}
function makeCacheDir(): string {
  return mkdtempSync(join(tmpdir(), "cp-cache-"));
}
function okResponse(version: string) {
  return { ok: true, json: async () => ({ version }) } as Response;
}

let cacheDir: string;
beforeEach(() => {
  cacheDir = makeCacheDir();
});

describe("checkForUpdate", () => {
  it("최신이 더 높으면 {installed, latest} 반환하고 fetch를 호출한다", async () => {
    const root = makePluginRoot("0.1.0");
    const fetchImpl = vi.fn(async () => okResponse("0.2.0"));
    const r = await checkForUpdate(root, { fetchImpl: fetchImpl as any, cacheDir, now: 1000 });
    expect(r).toEqual({ installed: "0.1.0", latest: "0.2.0" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("최신이 같거나 낮으면 null", async () => {
    const root = makePluginRoot("0.2.0");
    const fetchImpl = vi.fn(async () => okResponse("0.2.0"));
    const r = await checkForUpdate(root, { fetchImpl: fetchImpl as any, cacheDir, now: 1000 });
    expect(r).toBeNull();
  });

  it("캐시가 유효하면 fetch를 호출하지 않고 캐시 latest로 비교한다", async () => {
    const root = makePluginRoot("0.1.0");
    // 캐시를 미리 기록(0.3.0, 방금 확인함)
    writeFileSync(join(cacheDir, "update-check.json"), JSON.stringify({ checkedAt: 1000, latest: "0.3.0" }));
    const fetchImpl = vi.fn(async () => okResponse("0.9.0"));
    const r = await checkForUpdate(root, { fetchImpl: fetchImpl as any, cacheDir, now: 1000 + 60_000, ttlMs: 86_400_000 });
    expect(r).toEqual({ installed: "0.1.0", latest: "0.3.0" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("캐시가 만료되면 fetch하고 캐시를 갱신한다", async () => {
    const root = makePluginRoot("0.1.0");
    writeFileSync(join(cacheDir, "update-check.json"), JSON.stringify({ checkedAt: 0, latest: "0.1.0" }));
    const fetchImpl = vi.fn(async () => okResponse("0.4.0"));
    const r = await checkForUpdate(root, { fetchImpl: fetchImpl as any, cacheDir, now: 86_400_000 + 1, ttlMs: 86_400_000 });
    expect(r).toEqual({ installed: "0.1.0", latest: "0.4.0" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("fetch 실패면 null(throw 안 함)", async () => {
    const root = makePluginRoot("0.1.0");
    const fetchImpl = vi.fn(async () => { throw new Error("network down"); });
    const r = await checkForUpdate(root, { fetchImpl: fetchImpl as any, cacheDir, now: 1000 });
    expect(r).toBeNull();
  });

  it("비 200 응답이면 null", async () => {
    const root = makePluginRoot("0.1.0");
    const fetchImpl = vi.fn(async () => ({ ok: false } as Response));
    const r = await checkForUpdate(root, { fetchImpl: fetchImpl as any, cacheDir, now: 1000 });
    expect(r).toBeNull();
  });

  it("설치 plugin.json이 없으면 fetch 없이 null", async () => {
    const root = mkdtempSync(join(tmpdir(), "cp-empty-"));
    const fetchImpl = vi.fn(async () => okResponse("9.9.9"));
    const r = await checkForUpdate(root, { fetchImpl: fetchImpl as any, cacheDir, now: 1000 });
    expect(r).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- checkUpdate`
Expected: FAIL (module not found)

- [ ] **Step 3: 최소 구현**

```typescript
// src/version/checkUpdate.ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test -- checkUpdate`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/version/checkUpdate.ts tests/version/checkUpdate.test.ts
git commit -m "feat: best-effort 플러그인 업데이트 조회 checkForUpdate 추가"
```

---

### Task 4: sessionStart 훅 통합 (알림 블록 + 옷아웃)

**Files:**
- Modify: `src/hooks/sessionStart.ts`
- Test: `tests/hooks/sessionStart.test.ts`

**Interfaces:**
- Consumes: `checkForUpdate`, `UpdateInfo` (Task 3); `InitConfig.versionCheck` (Task 2).
- Produces: `buildSessionStartOutput(root, pluginRoot, deps?)` — 선택적 `deps: { checkForUpdate?: typeof checkForUpdate }` 주입 seam. 옷아웃(`config.versionCheck===false` 또는 `process.env.CONCEPTPOWERS_NO_VERSION_CHECK`) 시 조회 생략. 업데이트 있으면 `additionalContext`에 `<CONCEPTPOWERS-UPDATE>` 블록 append.

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/hooks/sessionStart.test.ts`에 추가(파일 상단 import에 아무 변경 불필요 — `deps`로 주입):

```typescript
describe("플러그인 업데이트 알림", () => {
  it("새 버전이 있으면 <CONCEPTPOWERS-UPDATE> 블록과 업데이트 명령을 담는다", async () => {
    await scaffoldInit(root, {});
    const o = await buildSessionStartOutput(root, "/plugin", {
      checkForUpdate: async () => ({ installed: "0.1.0", latest: "0.2.0" }),
    });
    const ctx = o!.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("<CONCEPTPOWERS-UPDATE>");
    expect(ctx).toContain("0.2.0");
    expect(ctx).toContain("/plugin marketplace update conceptpowers-dev");
  });

  it("업데이트가 없으면 블록이 없다", async () => {
    await scaffoldInit(root, {});
    const o = await buildSessionStartOutput(root, "/plugin", {
      checkForUpdate: async () => null,
    });
    expect(o!.hookSpecificOutput.additionalContext).not.toContain("<CONCEPTPOWERS-UPDATE>");
  });

  it("versionCheck:false면 조회 자체를 안 한다", async () => {
    await scaffoldInit(root, { });
    // init.json의 versionCheck를 false로 덮어쓴다
    const { writeFile } = await import("node:fs/promises");
    const { cpPaths } = await import("../../src/paths.js");
    const raw = JSON.parse(await (await import("node:fs/promises")).readFile(cpPaths(root).initFile, "utf8"));
    await writeFile(cpPaths(root).initFile, JSON.stringify({ ...raw, versionCheck: false }));

    let called = false;
    const o = await buildSessionStartOutput(root, "/plugin", {
      checkForUpdate: async () => { called = true; return { installed: "0.1.0", latest: "9.9.9" }; },
    });
    expect(called).toBe(false);
    expect(o!.hookSpecificOutput.additionalContext).not.toContain("<CONCEPTPOWERS-UPDATE>");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- sessionStart`
Expected: FAIL (3번째 인자 미지원 / 블록 없음)

- [ ] **Step 3: 구현**

`src/hooks/sessionStart.ts`를 수정한다.

import에 추가:

```typescript
import { checkForUpdate as defaultCheckForUpdate, type UpdateInfo } from "../version/checkUpdate.js";
```

`SessionStartOutput` 인터페이스 아래에 deps 타입 추가:

```typescript
export interface SessionStartDeps {
  checkForUpdate?: (pluginRoot: string) => Promise<UpdateInfo | null>;
}
```

함수 시그니처를 deps 받도록 변경:

```typescript
export async function buildSessionStartOutput(
  root: string,
  pluginRoot: string,
  deps: SessionStartDeps = {},
): Promise<SessionStartOutput | null> {
```

기존 `driftBlock` 계산 뒤(`return {` 직전)에 업데이트 블록 계산 추가:

```typescript
  // best-effort: 업데이트 조회 실패가 세션 시작을 막지 않게 한다.
  let updateBlock = "";
  const versionCheckOn =
    config?.versionCheck !== false && !process.env.CONCEPTPOWERS_NO_VERSION_CHECK;
  if (versionCheckOn) {
    try {
      const check = deps.checkForUpdate ?? defaultCheckForUpdate;
      const update = await check(pluginRoot);
      if (update) {
        updateBlock =
          "\n" +
          [
            "<CONCEPTPOWERS-UPDATE>",
            `A newer Conceptpowers version is available: v${update.latest} (installed v${update.installed}).`,
            "Tell the user once, in one concise line, that an update is available and how to apply it:",
            "  /plugin marketplace update conceptpowers-dev",
            "Updates are manual by design; do not nag repeatedly within this session.",
            "</CONCEPTPOWERS-UPDATE>",
          ].join("\n");
      }
    } catch {
      updateBlock = "";
    }
  }
```

`return`의 `additionalContext`를 `context + driftBlock + updateBlock`으로 변경:

```typescript
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context + driftBlock + updateBlock,
    },
  };
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test -- sessionStart`
Expected: PASS (기존 + 신규 3 테스트)

- [ ] **Step 5: 전체 테스트 + 타입체크**

Run: `pnpm test && pnpm typecheck`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/hooks/sessionStart.ts tests/hooks/sessionStart.test.ts
git commit -m "feat: SessionStart에 플러그인 새 버전 알림 블록 주입(옷아웃 지원)"
```

---

### Task 5: 문서 + 빌드

**Files:**
- Modify: `README.md` (그리고 `README.ko.md`가 있으면 함께)
- Rebuild: `dist/`

- [ ] **Step 1: README에 동작·옷아웃 한 줄 추가**

README의 적절한 섹션(설정/기능)에 추가:

```markdown
### 새 버전 알림 (version check)

conceptpowers가 활성화된 프로젝트는 세션 시작 시 GitHub의 최신 플러그인 버전을 확인하고,
더 높은 버전이 있으면 한 줄로 알립니다(업데이트는 수동: `/plugin marketplace update conceptpowers-dev`).
조회는 24h 캐시·짧은 타임아웃의 best-effort이며 실패해도 세션에 영향이 없습니다.

끄려면 `docs/conceptpowers/init.json`에 `"versionCheck": false`를 두거나,
환경변수 `CONCEPTPOWERS_NO_VERSION_CHECK=1`을 설정하세요.
```

(영문 README가 있으면 동일 내용 영어로.)

- [ ] **Step 2: 빌드(훅은 dist를 직접 실행)**

Run: `pnpm build`
Expected: 성공, `dist/hooks/sessionStart.js`와 `dist/version/*.js` 생성

- [ ] **Step 3: 커밋**

```bash
git add README.md dist
git commit -m "docs: 새 버전 알림 문서화 + dist 재빌드"
```

- [ ] **Step 4(선택, 사용자 확인 후): 릴리스**

자기 자신을 첫 알림 대상으로 만들려면:

Run: `pnpm release patch`  → v0.1.1 (3 매니페스트 동기화 + dist 재빌드 + 커밋 + 태그)
이후: `git push --follow-tags`
**주의:** 사용자 명시 승인 후에만 실행.

---

## Self-Review

**Spec coverage:**
- versionCheck 옷아웃(config) → Task 2 ✅
- 옷아웃(env) → Task 4 게이트 ✅
- semver 비교 → Task 1 ✅
- 설치 버전 읽기 + 캐시(24h) + fetch(1.5s 타임아웃) + best-effort null → Task 3 ✅
- SessionStart `<CONCEPTPOWERS-UPDATE>` 주입 + 에이전트 한 줄 안내 + 업데이트 명령 → Task 4 ✅
- 출처 GitHub raw plugin.json → Task 3 상수 ✅
- 캐시 위치/환경변수 재정의 → Task 3 ✅
- 실패/오프라인/비200/다운그레이드 → Task 3 테스트 ✅
- 테스트 80%+ 네트워크 비의존 → Task 1/3/4 모킹·주입 ✅
- 배포 빌드 + README → Task 5 ✅

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. 플레이스홀더 없음. ✅

**Type consistency:** `checkForUpdate(pluginRoot, opts?)`/`UpdateInfo {installed, latest}`/`isNewer(remote, installed)`가 Task 1·3·4에서 일관. `deps.checkForUpdate` 시그니처는 `(pluginRoot) => Promise<UpdateInfo|null>`로 통일. ✅
