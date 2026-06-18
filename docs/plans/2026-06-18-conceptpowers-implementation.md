# Conceptpowers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개념(Concept) 기반 개발 거버넌스를 강제하는 Claude Code 플러그인 `conceptpowers`를 구축한다 — 결정론적 TypeScript CLI 엔진 + 의미 판단 스킬 + 활성화/게이트 훅.

**Architecture:** 세 계층으로 분리한다. (1) **TS CLI 엔진**(`src/`): 개념 스키마(Zod)·스토어·HTML 렌더러·`@concept` 태그 매핑·정합성 감사 등 결정론적 로직을 TDD로 구현하고 `dist/`로 빌드. (2) **스킬**(`skills/*/SKILL.md`): init/define-concept/check-concept/check-consistency/update-baseline/update-mapping/audit — 에이전트가 의미 판단을 수행하며 필요 시 CLI를 호출. (3) **훅**(`hooks/`): SessionStart가 `docs/conceptpowers/init.json` 마커를 자동 탐색해 활성화(+CLI 경로 주입), PreToolUse가 코드 수정/`git commit`에 게이트를 건다.

**Tech Stack:** TypeScript(ESM, NodeNext) · Zod(검증) · Vitest(테스트) · Commander(CLI) · Node fs · Claude Code plugin(`.claude-plugin/`, `hooks/hooks.json`, `skills/`). **패키지 매니저: pnpm**(락파일 `pnpm-lock.yaml`).

> 명령 표기: 본 계획의 모든 `npm install`/`npm run build`/`npm run typecheck`/`npm test`/`npx vitest`는 각각 `pnpm install`/`pnpm build`/`pnpm typecheck`/`pnpm test`/`pnpm exec vitest`로 읽는다.

**참고 spec:** `docs/specs/2026-06-18-conceptpowers-design.md` (결정 D1~D17, 불변 원칙 8개).

---

## File Structure

```
Conceptpowers/
├── .claude-plugin/
│   ├── plugin.json              # 매니페스트
│   └── marketplace.json         # 자체 마켓플레이스 (D8)
├── package.json / tsconfig.json / vitest.config.ts
├── src/
│   ├── paths.ts                 # docs/conceptpowers 경로 헬퍼1
│   ├── schema/
│   │   ├── concept.ts           # Concept Zod 스키마 + 타입 (D10, D12)
│   │   └── initConfig.ts        # init.json 스키마 (D3, D16)
│   ├── store/conceptStore.ts    # 개념 JSON 읽기/쓰기/목록/slug 고유성
│   ├── viewer/
│   │   ├── render.ts            # Concept[] → HTML (D7)
│   │   └── template.ts          # HTML 템플릿 (LGEHS 구조)
│   ├── mapping/scan.ts          # @concept 태그 스캔 → mapping 캐시 (D6)
│   ├── audit/audit.ts           # 정합성 감사(태그·스키마·캐시) (D13)
│   ├── init/scaffold.ts         # docs/conceptpowers 5요소 생성 (D9)
│   ├── hooks/
│   │   ├── sessionStart.ts      # 마커 탐색 → 활성화 컨텍스트 (D15)
│   │   └── preToolUse.ts        # Edit/Write·git commit 게이트 (D17)
│   └── cli.ts                   # commander 엔트리
├── assets/concept.css           # 뷰어 스타일
├── hooks/
│   ├── hooks.json               # 훅 선언
│   ├── session-start            # node dist/hooks/sessionStart.js 래퍼
│   └── pre-tool-use             # node dist/hooks/preToolUse.js 래퍼
├── skills/
│   ├── init/SKILL.md
│   ├── define-concept/SKILL.md
│   ├── check-concept/SKILL.md
│   ├── check-consistency/SKILL.md
│   ├── update-baseline/SKILL.md
│   ├── update-mapping/SKILL.md
│   └── audit/SKILL.md
├── tests/                       # vitest 유닛/통합 테스트
├── README.md
└── CLAUDE.md
```

**핵심 타입 (전 태스크 공유):**

```ts
// Concept (src/schema/concept.ts) — 아래 Task 2에서 정의
// InitConfig (src/schema/initConfig.ts) — Task 3
// Mapping = Record<string, string[]>  (slug → file paths)  — Task 7
// AuditReport (src/audit/audit.ts) — Task 8
```

---

## Phase 0 — 프로젝트 스캐폴딩

### Task 1: Node/TS/Vitest 툴체인 + 플러그인 매니페스트

**Files:**

- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`

- [ ] **Step 1: `package.json` 작성**

```json
{
  "name": "conceptpowers",
  "version": "0.1.0",
  "description": "Concept-driven development governance for Claude Code",
  "type": "module",
  "bin": { "conceptpowers": "dist/cli.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "commander": "^12.1.0", "zod": "^3.23.8" },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: `tsconfig.json` 작성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: `vitest.config.ts` + `.gitignore`**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: { provider: "v8", lines: 80 },
  },
});
```

```gitignore
node_modules/
dist/
coverage/
```

- [ ] **Step 4: 플러그인 매니페스트**

```json
// .claude-plugin/plugin.json
{
  "name": "conceptpowers",
  "description": "Concept-driven development governance: define concepts before code, enforce that changes never violate them",
  "version": "0.1.0",
  "author": { "name": "inyeol Hong", "email": "iyhong@intellicode.co.kr" },
  "license": "MIT",
  "keywords": ["concept", "governance", "skills", "consistency", "guardrails"]
}
```

```json
// .claude-plugin/marketplace.json
{
  "name": "conceptpowers-dev",
  "description": "Marketplace for the Conceptpowers governance plugin",
  "owner": { "name": "inyeol Hong", "email": "iyhong@intellicode.co.kr" },
  "plugins": [
    {
      "name": "conceptpowers",
      "description": "Concept-driven development governance for Claude Code",
      "version": "0.1.0",
      "source": "./",
      "author": { "name": "inyeol Hong", "email": "iyhong@intellicode.co.kr" }
    }
  ]
}
```

- [ ] **Step 5: 설치 및 검증**

Run: `npm install && npm run typecheck`
Expected: 설치 성공, 타입 에러 없음(아직 src 없음 → 0 files, exit 0)

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore .claude-plugin
git commit -m "chore: TS/Vitest 툴체인 및 플러그인 매니페스트 스캐폴딩"
```

---

## Phase 1 — 스키마 (Zod)

### Task 2: Concept 스키마 + 타입

**Files:**

- Create: `src/schema/concept.ts`
- Test: `tests/schema/concept.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/schema/concept.test.ts
import { describe, it, expect } from "vitest";
import { ConceptSchema, parseConcept } from "../../src/schema/concept.js";

const valid = {
  slug: "admin-role",
  group: "auth",
  category: ["role"],
  title: "Admin Role",
  description: { definition: "운영자 권한 계층" },
  purpose: { reason: "리소스 배분" },
  actions: { allow: ["역할 지정"], restrict: ["직접 개발 불가"] },
  principle: { immutableRules: ["모든 변경은 감사 로그"] },
};

describe("ConceptSchema", () => {
  it("유효한 개념을 파싱하고 기본값을 채운다", () => {
    const c = parseConcept(valid);
    expect(c.slug).toBe("admin-role");
    expect(c.category).toEqual(["role"]);
    expect(c.relations.related).toEqual([]); // 기본값
    expect(c.codeLinks).toEqual([]);
  });
  it("잘못된 slug를 거부한다", () => {
    expect(() => parseConcept({ ...valid, slug: "Admin Role" })).toThrow();
  });
  it("category가 비면 거부한다", () => {
    expect(() => parseConcept({ ...valid, category: [] })).toThrow();
  });
  it("알 수 없는 category 값을 거부한다", () => {
    expect(() => parseConcept({ ...valid, category: ["nope"] })).toThrow();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/schema/concept.test.ts`
Expected: FAIL — `Cannot find module '../../src/schema/concept.js'`

- [ ] **Step 3: 최소 구현**

```ts
// src/schema/concept.ts
import { z } from "zod";

export const ConceptCategory = z.enum([
  "feature",
  "behavior",
  "role",
  "permission",
  "term",
]);
export type ConceptCategory = z.infer<typeof ConceptCategory>;

const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug는 kebab-case여야 합니다");

export const ConceptSchema = z.object({
  slug,
  group: z.string().default(""),
  category: z.array(ConceptCategory).min(1, "category는 최소 1개"),
  number: z.number().int().positive().optional(),
  title: z.string().min(1),
  eyebrow: z.string().default(""),
  description: z.object({
    definition: z.string().min(1),
    analogy: z.string().default(""),
    components: z.array(z.string()).default([]),
    example: z.string().default(""),
  }),
  purpose: z.object({
    reason: z.string().min(1),
    benefits: z.array(z.string()).default([]),
    vision: z.string().default(""),
    painPoints: z.array(z.string()).default([]),
  }),
  actions: z.object({
    allow: z.array(z.string()).default([]),
    restrict: z.array(z.string()).default([]),
    interaction: z.string().default(""),
  }),
  principle: z.object({
    immutableRules: z.array(z.string()).default([]),
    tradeoffs: z.string().default(""),
    lifecycle: z.array(z.string()).default([]),
  }),
  relations: z
    .object({
      prev: z.string().default(""),
      next: z.string().default(""),
      related: z.array(z.string()).default([]),
    })
    .default({}),
  codeLinks: z.array(z.string()).default([]),
});

export type Concept = z.infer<typeof ConceptSchema>;

export function parseConcept(input: unknown): Concept {
  return ConceptSchema.parse(input);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/schema/concept.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/schema/concept.ts tests/schema/concept.test.ts
git commit -m "feat: Concept Zod 스키마 및 파서"
```

### Task 3: InitConfig 스키마 + 경로 헬퍼

**Files:**

- Create: `src/schema/initConfig.ts`, `src/paths.ts`
- Test: `tests/schema/initConfig.test.ts`, `tests/paths.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/schema/initConfig.test.ts
import { describe, it, expect } from "vitest";
import { parseInitConfig } from "../../src/schema/initConfig.js";

describe("InitConfig", () => {
  it("기본 backfillMode는 incremental", () => {
    const c = parseInitConfig({ version: "0.1.0", enabled: true });
    expect(c.backfillMode).toBe("incremental");
  });
  it("strict를 허용한다", () => {
    expect(
      parseInitConfig({
        version: "0.1.0",
        enabled: true,
        backfillMode: "strict",
      }).backfillMode,
    ).toBe("strict");
  });
  it("enabled가 true가 아니면 거부한다", () => {
    expect(() =>
      parseInitConfig({ version: "0.1.0", enabled: false }),
    ).toThrow();
  });
});
```

```ts
// tests/paths.test.ts
import { describe, it, expect } from "vitest";
import { cpPaths } from "../../src/paths.js";

describe("cpPaths", () => {
  it("init.json 경로를 만든다", () => {
    expect(cpPaths("/proj").initFile).toBe(
      "/proj/docs/conceptpowers/init.json",
    );
  });
  it("개념 데이터/뷰어/캐시 경로를 만든다", () => {
    const p = cpPaths("/proj");
    expect(p.conceptsData).toBe("/proj/docs/conceptpowers/concepts/data");
    expect(p.conceptsViewer).toBe("/proj/docs/conceptpowers/concepts/viewer");
    expect(p.mappingCache).toBe("/proj/docs/conceptpowers/.cache/mapping.json");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/schema/initConfig.test.ts tests/paths.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

```ts
// src/schema/initConfig.ts
import { z } from "zod";

export const InitConfigSchema = z.object({
  version: z.string(),
  enabled: z.literal(true),
  backfillMode: z.enum(["incremental", "strict"]).default("incremental"),
  enforceScope: z
    .literal("new-feature-behavior")
    .default("new-feature-behavior"),
  project: z
    .object({
      name: z.string().default(""),
      description: z.string().default(""),
    })
    .default({}),
});
export type InitConfig = z.infer<typeof InitConfigSchema>;
export function parseInitConfig(input: unknown): InitConfig {
  return InitConfigSchema.parse(input);
}
```

```ts
// src/paths.ts
import { join } from "node:path";

export const CP_REL = "docs/conceptpowers";

export function cpPaths(root: string) {
  const base = join(root, CP_REL);
  return {
    base,
    initFile: join(base, "init.json"),
    features: join(base, "features"),
    conceptsData: join(base, "concepts", "data"),
    conceptsViewer: join(base, "concepts", "viewer"),
    architecture: join(base, "architecture"),
    infra: join(base, "infra"),
    mappingCache: join(base, ".cache", "mapping.json"),
    cssTarget: join(base, "concepts", "viewer", "assets", "concept.css"),
  } as const;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/schema/initConfig.test.ts tests/paths.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/schema/initConfig.ts src/paths.ts tests/schema/initConfig.test.ts tests/paths.test.ts
git commit -m "feat: InitConfig 스키마 및 경로 헬퍼"
```

---

## Phase 2 — 개념 스토어

### Task 4: 개념 읽기/쓰기/목록/slug 고유성

**Files:**

- Create: `src/store/conceptStore.ts`
- Test: `tests/store/conceptStore.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/store/conceptStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeConcept,
  listConcepts,
  readConcept,
  slugExists,
} from "../../src/store/conceptStore.js";

const base = {
  slug: "admin-role",
  group: "auth",
  category: ["role"],
  title: "Admin Role",
  description: { definition: "d" },
  purpose: { reason: "r" },
  actions: {},
  principle: {},
};
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cp-"));
});

describe("conceptStore", () => {
  it("개념을 그룹 폴더에 쓰고 다시 읽는다", async () => {
    await writeConcept(root, base as any);
    const read = await readConcept(root, "admin-role");
    expect(read?.title).toBe("Admin Role");
  });
  it("모든 개념을 그룹 하위까지 재귀로 나열한다", async () => {
    await writeConcept(root, base as any);
    await writeConcept(root, {
      ...base,
      slug: "user-role",
      group: "auth",
    } as any);
    await writeConcept(root, {
      ...base,
      slug: "token-meter",
      group: "billing",
    } as any);
    const all = await listConcepts(root);
    expect(all.map((c) => c.slug).sort()).toEqual([
      "admin-role",
      "token-meter",
      "user-role",
    ]);
  });
  it("slug 존재 여부를 전역으로 판단한다 (그룹 무관)", async () => {
    await writeConcept(root, base as any);
    expect(await slugExists(root, "admin-role")).toBe(true);
    expect(await slugExists(root, "nope")).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/store/conceptStore.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

```ts
// src/store/conceptStore.ts
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { cpPaths } from "../paths.js";
import { parseConcept, type Concept } from "../schema/concept.js";

function fileFor(root: string, c: Concept): string {
  const dataDir = cpPaths(root).conceptsData;
  return c.group
    ? join(dataDir, c.group, `${c.slug}.json`)
    : join(dataDir, `${c.slug}.json`);
}

export async function writeConcept(
  root: string,
  input: unknown,
): Promise<Concept> {
  const concept = parseConcept(input);
  const target = fileFor(root, concept);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(concept, null, 2) + "\n", "utf8");
  return concept;
}

async function walkJson(dir: string): Promise<string[]> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkJson(full)));
    else if (e.name.endsWith(".json")) out.push(full);
  }
  return out;
}

export async function listConcepts(root: string): Promise<Concept[]> {
  const files = await walkJson(cpPaths(root).conceptsData);
  const concepts: Concept[] = [];
  for (const f of files) {
    try {
      concepts.push(parseConcept(JSON.parse(await readFile(f, "utf8"))));
    } catch (error) {
      throw new Error(
        `개념 파일 파싱 실패: ${f} — ${(error as Error).message}`,
      );
    }
  }
  return concepts;
}

export async function readConcept(
  root: string,
  slug: string,
): Promise<Concept | null> {
  return (await listConcepts(root)).find((c) => c.slug === slug) ?? null;
}

export async function slugExists(root: string, slug: string): Promise<boolean> {
  return (await readConcept(root, slug)) !== null;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/store/conceptStore.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/store/conceptStore.ts tests/store/conceptStore.test.ts
git commit -m "feat: 개념 스토어 (읽기/쓰기/목록/slug 고유성)"
```

---

## Phase 3 — HTML 뷰어 렌더러

### Task 5: 개념 → HTML 렌더링

**Files:**

- Create: `src/viewer/template.ts`, `src/viewer/render.ts`
- Test: `tests/viewer/render.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/viewer/render.test.ts
import { describe, it, expect } from "vitest";
import { renderViewer } from "../../src/viewer/render.js";
import type { Concept } from "../../src/schema/concept.js";

const c: Concept = {
  slug: "admin-role",
  group: "auth",
  category: ["role"],
  title: "Admin Role",
  eyebrow: "운영자 역할",
  description: {
    definition: "운영자 권한 계층",
    analogy: "관제 센터장",
    components: ["대시보드"],
    example: "",
  },
  purpose: {
    reason: "리소스 배분",
    benefits: ["시간 절감"],
    vision: "",
    painPoints: [],
  },
  actions: {
    allow: ["역할 지정"],
    restrict: ["직접 개발 불가"],
    interaction: "",
  },
  principle: {
    immutableRules: ["모든 변경은 감사 로그"],
    tradeoffs: "",
    lifecycle: [],
  },
  relations: { prev: "", next: "", related: [] },
  codeLinks: [],
} as Concept;

describe("renderViewer", () => {
  it("index.html과 그룹별 개념 페이지를 생성한다", () => {
    const out = renderViewer([c]);
    expect(Object.keys(out)).toContain("index.html");
    expect(Object.keys(out)).toContain("auth/admin-role.html");
  });
  it("개념 페이지에 제목과 허용/제한 행동을 포함한다", () => {
    const out = renderViewer([c]);
    const page = out["auth/admin-role.html"];
    expect(page).toContain("Admin Role");
    expect(page).toContain("역할 지정");
    expect(page).toContain("직접 개발 불가");
  });
  it("HTML을 이스케이프한다(XSS 방지)", () => {
    const evil = { ...c, title: "<script>x</script>" } as Concept;
    const out = renderViewer([evil]);
    expect(out["auth/admin-role.html"]).not.toContain("<script>x</script>");
    expect(out["auth/admin-role.html"]).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/viewer/render.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 — 템플릿**

```ts
// src/viewer/template.ts
import type { Concept } from "../schema/concept.js";

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function list(items: string[]): string {
  return items.length
    ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
    : "";
}

const cssHref = (depth: number) => `${"../".repeat(depth)}assets/concept.css`;

export function conceptPage(c: Concept): string {
  const depth = c.group ? 1 : 0;
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(c.title)} · concept</title>
<link rel="stylesheet" href="${cssHref(depth + 1)}"/></head>
<body><div class="wrap">
<header class="hero"><span class="hero__eyebrow">${esc(c.eyebrow)}</span>
<h1>${esc(c.title)}</h1><p>${esc(c.description.definition)}</p>
<p class="cats">${c.category.map(esc).join(" · ")}</p></header>
<section class="section"><h2>설명</h2><p>${esc(c.description.definition)}</p>
${c.description.analogy ? `<p class="analogy">${esc(c.description.analogy)}</p>` : ""}
${list(c.description.components)}</section>
<section class="section"><h2>목적</h2><p>${esc(c.purpose.reason)}</p>${list(c.purpose.benefits)}</section>
<section class="section cols"><div class="col-card col-card--allow"><h3>허용 행동</h3>${list(c.actions.allow)}</div>
<div class="col-card col-card--restrict"><h3>제한 행동</h3>${list(c.actions.restrict)}</div></section>
<section class="section"><h2>운영 원칙</h2>${list(c.principle.immutableRules)}
${c.principle.tradeoffs ? `<p>${esc(c.principle.tradeoffs)}</p>` : ""}</section>
</div></body></html>\n`;
}

export function indexPage(concepts: Concept[]): string {
  const byGroup = new Map<string, Concept[]>();
  for (const c of concepts) {
    const g = c.group || "(ungrouped)";
    byGroup.set(g, [...(byGroup.get(g) ?? []), c]);
  }
  const sections = [...byGroup.entries()]
    .map(
      ([g, cs]) =>
        `<section class="group"><h2>${esc(g)}</h2><ul>${cs
          .map((c) => {
            const href = c.group
              ? `${esc(c.group)}/${esc(c.slug)}.html`
              : `${esc(c.slug)}.html`;
            return `<li><a href="${href}">${esc(c.title)}</a> <small>${c.category.map(esc).join(", ")}</small></li>`;
          })
          .join("")}</ul></section>`,
    )
    .join("");
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/>
<title>개념 목록 · Conceptpowers</title><link rel="stylesheet" href="assets/concept.css"/></head>
<body><div class="wrap"><header class="hero"><h1>개념 목록</h1></header>${sections}</div></body></html>\n`;
}
```

```ts
// src/viewer/render.ts
import type { Concept } from "../schema/concept.js";
import { conceptPage, indexPage } from "./template.js";

export function renderViewer(concepts: Concept[]): Record<string, string> {
  const out: Record<string, string> = { "index.html": indexPage(concepts) };
  for (const c of concepts) {
    const rel = c.group ? `${c.group}/${c.slug}.html` : `${c.slug}.html`;
    out[rel] = conceptPage(c);
  }
  return out;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/viewer/render.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: `assets/concept.css` 작성 (최소 스타일)**

```css
/* assets/concept.css */
:root {
  --fg: #1a1a1a;
  --muted: #666;
  --allow: #0a7d33;
  --restrict: #b3261e;
}
body {
  font-family: system-ui, sans-serif;
  color: var(--fg);
  margin: 0;
  line-height: 1.6;
}
.wrap {
  max-width: 820px;
  margin: 0 auto;
  padding: 32px 20px;
}
.hero__eyebrow {
  color: var(--muted);
  font-size: 0.85rem;
}
.section {
  margin: 28px 0;
  padding-top: 16px;
  border-top: 1px solid #eee;
}
.cols {
  display: flex;
  gap: 16px;
}
.col-card {
  flex: 1;
  padding: 14px;
  border-radius: 8px;
  background: #fafafa;
}
.col-card--allow h3 {
  color: var(--allow);
}
.col-card--restrict h3 {
  color: var(--restrict);
}
.analogy {
  color: var(--muted);
  font-style: italic;
}
.group h2 {
  font-size: 1.1rem;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/viewer tests/viewer/render.test.ts assets/concept.css
git commit -m "feat: 개념 HTML 뷰어 렌더러 및 스타일"
```

### Task 6: 뷰어 디스크 기록 (renderViewerToDisk)

**Files:**

- Modify: `src/viewer/render.ts`
- Test: `tests/viewer/renderDisk.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/viewer/renderDisk.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderViewerToDisk } from "../../src/viewer/render.js";
import { writeConcept } from "../../src/store/conceptStore.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cp-"));
});

it("개념 데이터를 읽어 뷰어 HTML과 CSS를 디스크에 쓴다", async () => {
  await writeConcept(root, {
    slug: "admin-role",
    group: "auth",
    category: ["role"],
    title: "Admin Role",
    description: { definition: "d" },
    purpose: { reason: "r" },
    actions: {},
    principle: {},
  });
  await renderViewerToDisk(root);
  expect(
    existsSync(join(root, "docs/conceptpowers/concepts/viewer/index.html")),
  ).toBe(true);
  expect(
    existsSync(
      join(root, "docs/conceptpowers/concepts/viewer/auth/admin-role.html"),
    ),
  ).toBe(true);
  expect(
    readFileSync(
      join(root, "docs/conceptpowers/concepts/viewer/index.html"),
      "utf8",
    ),
  ).toContain("Admin Role");
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/viewer/renderDisk.test.ts`
Expected: FAIL — `renderViewerToDisk` 없음

- [ ] **Step 3: 최소 구현 (render.ts에 추가)**

`assets/concept.css`를 빌드 시 `dist`로 복사하기 위해, 런타임에서 패키지 루트의 css를 읽도록 한다.

```ts
// src/viewer/render.ts 에 추가
import { mkdir, writeFile, readFile, cp } from "node:fs/promises";
import { join, dirname, fileURLToPath } from "node:path"; // 주: fileURLToPath는 node:url에서
import { fileURLToPath as f2 } from "node:url";
import { listConcepts } from "../store/conceptStore.js";
import { cpPaths } from "../paths.js";

async function readBundledCss(): Promise<string> {
  // dist/viewer/render.js 기준 → 패키지 루트의 assets/concept.css
  const here = dirname(f2(import.meta.url));
  const cssPath = join(here, "..", "..", "assets", "concept.css");
  return readFile(cssPath, "utf8");
}

export async function renderViewerToDisk(root: string): Promise<void> {
  const concepts = await listConcepts(root);
  const files = renderViewer(concepts);
  const viewer = cpPaths(root).conceptsViewer;
  for (const [rel, html] of Object.entries(files)) {
    const target = join(viewer, rel);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html, "utf8");
  }
  const cssTarget = cpPaths(root).cssTarget;
  await mkdir(dirname(cssTarget), { recursive: true });
  await writeFile(cssTarget, await readBundledCss(), "utf8");
}
```

> 주: 위 import에서 `fileURLToPath`는 `node:url`에서 가져온다(`f2`). `node:path`의 잘못된 import 줄은 구현 시 제거할 것. 구현자는 다음 import만 사용한다:
>
> ```ts
> import { mkdir, writeFile, readFile } from "node:fs/promises";
> import { join, dirname } from "node:path";
> import { fileURLToPath } from "node:url";
> import { listConcepts } from "../store/conceptStore.js";
> import { cpPaths } from "../paths.js";
> ```
>
> 그리고 `f2` 대신 `fileURLToPath`를 사용한다.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/viewer/renderDisk.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/viewer/render.ts tests/viewer/renderDisk.test.ts
git commit -m "feat: 뷰어 HTML/CSS 디스크 기록 (renderViewerToDisk)"
```

---

## Phase 4 — 매핑 스캔

### Task 7: `@concept` 태그 스캔 + mapping 캐시

**Files:**

- Create: `src/mapping/scan.ts`
- Test: `tests/mapping/scan.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/mapping/scan.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanTags, buildMapping } from "../../src/mapping/scan.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cp-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src/a.ts"),
    "// @concept:admin-role\nexport const a = 1\n",
  );
  writeFileSync(
    join(root, "src/b.ts"),
    "/* @concept:user-role @concept:admin-role */\n",
  );
});

describe("mapping scan", () => {
  it("파일에서 @concept 태그를 추출한다", async () => {
    const tags = await scanTags(root, ["src/a.ts", "src/b.ts"]);
    expect(tags).toEqual({
      "src/a.ts": ["admin-role"],
      "src/b.ts": ["user-role", "admin-role"],
    });
  });
  it("slug → 파일 매핑을 만든다", async () => {
    const m = await buildMapping(root, ["src/a.ts", "src/b.ts"]);
    expect(m["admin-role"].sort()).toEqual(["src/a.ts", "src/b.ts"]);
    expect(m["user-role"]).toEqual(["src/b.ts"]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/mapping/scan.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

```ts
// src/mapping/scan.ts
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { cpPaths } from "../paths.js";

export type Mapping = Record<string, string[]>;
const TAG_RE = /@concept:([a-z0-9]+(?:-[a-z0-9]+)*)/g;

export async function scanTags(
  root: string,
  files: string[],
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  for (const rel of files) {
    let content: string;
    try {
      content = await readFile(join(root, rel), "utf8");
    } catch {
      continue;
    }
    const slugs: string[] = [];
    for (const m of content.matchAll(TAG_RE)) slugs.push(m[1]);
    if (slugs.length) result[rel] = slugs;
  }
  return result;
}

export async function buildMapping(
  root: string,
  files: string[],
): Promise<Mapping> {
  const tags = await scanTags(root, files);
  const mapping: Mapping = {};
  for (const [file, slugs] of Object.entries(tags)) {
    for (const slug of slugs) mapping[slug] = [...(mapping[slug] ?? []), file];
  }
  return mapping;
}

export async function writeMappingCache(
  root: string,
  mapping: Mapping,
): Promise<void> {
  const target = cpPaths(root).mappingCache;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(mapping, null, 2) + "\n", "utf8");
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/mapping/scan.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/mapping/scan.ts tests/mapping/scan.test.ts
git commit -m "feat: @concept 태그 스캔 및 mapping 캐시"
```

---

## Phase 5 — Init 스캐폴더

### Task 8: docs/conceptpowers 5요소 생성

**Files:**

- Create: `src/init/scaffold.ts`
- Test: `tests/init/scaffold.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/init/scaffold.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffoldInit, isInitialized } from "../../src/init/scaffold.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cp-"));
});

describe("scaffoldInit", () => {
  it("5요소 폴더와 init.json을 만든다", async () => {
    await scaffoldInit(root, { backfillMode: "incremental" });
    const b = join(root, "docs/conceptpowers");
    for (const d of [
      "features",
      "concepts/data",
      "concepts/viewer",
      "architecture",
      "infra",
    ])
      expect(existsSync(join(b, d))).toBe(true);
    expect(existsSync(join(b, "init.json"))).toBe(true);
  });
  it("init.json에 backfillMode를 기록한다", async () => {
    await scaffoldInit(root, { backfillMode: "strict" });
    const cfg = JSON.parse(
      readFileSync(join(root, "docs/conceptpowers/init.json"), "utf8"),
    );
    expect(cfg.enabled).toBe(true);
    expect(cfg.backfillMode).toBe("strict");
  });
  it("isInitialized가 마커 존재를 감지한다", async () => {
    expect(await isInitialized(root)).toBe(false);
    await scaffoldInit(root, {});
    expect(await isInitialized(root)).toBe(true);
  });
  it("이미 초기화된 경우 init.json을 덮어쓰지 않는다", async () => {
    await scaffoldInit(root, { backfillMode: "strict" });
    await scaffoldInit(root, { backfillMode: "incremental" });
    const cfg = JSON.parse(
      readFileSync(join(root, "docs/conceptpowers/init.json"), "utf8"),
    );
    expect(cfg.backfillMode).toBe("strict"); // 보존
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/init/scaffold.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

```ts
// src/init/scaffold.ts
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { cpPaths } from "../paths.js";
import { parseInitConfig } from "../schema/initConfig.js";

export interface ScaffoldOptions {
  backfillMode?: "incremental" | "strict";
  name?: string;
  description?: string;
}

export async function isInitialized(root: string): Promise<boolean> {
  try {
    await access(cpPaths(root).initFile);
    return true;
  } catch {
    return false;
  }
}

export async function scaffoldInit(
  root: string,
  opts: ScaffoldOptions,
): Promise<void> {
  const p = cpPaths(root);
  for (const d of [
    p.features,
    p.conceptsData,
    p.conceptsViewer,
    p.architecture,
    p.infra,
  ])
    await mkdir(d, { recursive: true });

  if (await isInitialized(root)) return; // 보존: 사용자 전속(규칙4)

  const config = parseInitConfig({
    version: "0.1.0",
    enabled: true,
    backfillMode: opts.backfillMode ?? "incremental",
    project: { name: opts.name ?? "", description: opts.description ?? "" },
  });
  await writeFile(p.initFile, JSON.stringify(config, null, 2) + "\n", "utf8");
  await writeFile(
    join(p.architecture, "architecture.md"),
    "# 아키텍처\n\n<!-- 사용자가 직접 작성: 개념의 상위 기준 -->\n",
    "utf8",
  );
  await writeFile(
    join(p.infra, "infra.md"),
    "# 인프라\n\n<!-- 사용자가 직접 작성 -->\n",
    "utf8",
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/init/scaffold.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/init/scaffold.ts tests/init/scaffold.test.ts
git commit -m "feat: init 스캐폴더 (5요소 폴더 + init.json 마커)"
```

---

## Phase 6 — 정합성 감사

### Task 9: 감사 (태그·스키마·캐시 정합성)

**Files:**

- Create: `src/audit/audit.ts`
- Test: `tests/audit/audit.test.ts`

> 결정론적 감사는 **정합성**만 본다: 알 수 없는 태그, 스키마 오류, 캐시 불일치. "개념이 필요한데 누락된 코드"의 의미 판단은 audit 스킬이 수행한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/audit/audit.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditIntegrity } from "../../src/audit/audit.js";
import { writeConcept } from "../../src/store/conceptStore.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cp-"));
  mkdirSync(join(root, "src"), { recursive: true });
});

describe("auditIntegrity", () => {
  it("존재하는 개념을 가리키는 태그는 통과한다", async () => {
    await writeConcept(root, {
      slug: "admin-role",
      category: ["role"],
      title: "A",
      description: { definition: "d" },
      purpose: { reason: "r" },
      actions: {},
      principle: {},
    });
    writeFileSync(join(root, "src/a.ts"), "// @concept:admin-role\n");
    const r = await auditIntegrity(root, ["src/a.ts"]);
    expect(r.unknownTags).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it("없는 개념을 가리키는 태그를 unknownTags로 보고한다", async () => {
    writeFileSync(join(root, "src/a.ts"), "// @concept:ghost\n");
    const r = await auditIntegrity(root, ["src/a.ts"]);
    expect(r.unknownTags).toEqual([{ slug: "ghost", file: "src/a.ts" }]);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/audit/audit.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

```ts
// src/audit/audit.ts
import { listConcepts } from "../store/conceptStore.js";
import { scanTags } from "../mapping/scan.js";

export interface UnknownTag {
  slug: string;
  file: string;
}
export interface AuditReport {
  ok: boolean;
  unknownTags: UnknownTag[];
}

export async function auditIntegrity(
  root: string,
  files: string[],
): Promise<AuditReport> {
  const known = new Set((await listConcepts(root)).map((c) => c.slug));
  const tags = await scanTags(root, files);
  const unknownTags: UnknownTag[] = [];
  for (const [file, slugs] of Object.entries(tags))
    for (const slug of slugs)
      if (!known.has(slug)) unknownTags.push({ slug, file });
  return { ok: unknownTags.length === 0, unknownTags };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/audit/audit.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/audit/audit.ts tests/audit/audit.test.ts
git commit -m "feat: 정합성 감사 (unknownTags 탐지)"
```

---

## Phase 7 — CLI 엔트리

### Task 10: commander CLI 배선

**Files:**

- Create: `src/cli.ts`
- Test: `tests/cli/cli.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성 (서브커맨드 동작을 자식 프로세스로 검증)**

```ts
// tests/cli/cli.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cp-"));
});

describe("runCli", () => {
  it("init 서브커맨드가 스캐폴드를 만든다", async () => {
    const code = await runCli([
      "init",
      "--root",
      root,
      "--mode",
      "incremental",
    ]);
    expect(code).toBe(0);
    expect(existsSync(join(root, "docs/conceptpowers/init.json"))).toBe(true);
  });
  it("status가 초기화 여부를 JSON으로 출력한다", async () => {
    const out: string[] = [];
    const code = await runCli(["status", "--root", root], (s) => out.push(s));
    expect(code).toBe(0);
    expect(JSON.parse(out.join("")).initialized).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/cli/cli.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현 (테스트 가능한 `runCli` + 얇은 bin)**

```ts
// src/cli.ts
import { Command } from "commander";
import { scaffoldInit, isInitialized } from "./init/scaffold.js";
import { renderViewerToDisk } from "./viewer/render.js";
import { buildMapping, writeMappingCache } from "./mapping/scan.js";
import { auditIntegrity } from "./audit/audit.js";

type Out = (s: string) => void;

export async function runCli(
  argv: string[],
  out: Out = (s) => process.stdout.write(s),
): Promise<number> {
  const program = new Command();
  program.name("conceptpowers").exitOverride();
  let code = 0;

  program
    .command("init")
    .option("--root <dir>", "project root", process.cwd())
    .option("--mode <mode>", "incremental|strict", "incremental")
    .action(async (o) => {
      await scaffoldInit(o.root, { backfillMode: o.mode });
      if (o.mode === "strict") await renderViewerToDisk(o.root);
    });

  program
    .command("status")
    .option("--root <dir>", "project root", process.cwd())
    .action(async (o) => {
      out(JSON.stringify({ initialized: await isInitialized(o.root) }));
    });

  program
    .command("render")
    .option("--root <dir>", "project root", process.cwd())
    .action(async (o) => {
      await renderViewerToDisk(o.root);
    });

  program
    .command("map")
    .option("--root <dir>", "project root", process.cwd())
    .argument("<files...>")
    .action(async (files, o) => {
      await writeMappingCache(o.root, await buildMapping(o.root, files));
    });

  program
    .command("audit")
    .option("--root <dir>", "project root", process.cwd())
    .argument("<files...>")
    .action(async (files, o) => {
      const r = await auditIntegrity(o.root, files);
      out(JSON.stringify(r));
      if (!r.ok) code = 1;
    });

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (error) {
    out(JSON.stringify({ error: (error as Error).message }));
    return 1;
  }
  return code;
}
```

bin 진입 (파일 끝에 추가):

```ts
// src/cli.ts (끝)
const isMain =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runCli(process.argv.slice(2)).then((c) => process.exit(c));
}
```

- [ ] **Step 4: 통과 확인 + 빌드**

Run: `npx vitest run tests/cli/cli.test.ts && npm run build`
Expected: PASS (2 tests), 빌드 산출 `dist/cli.js`

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts tests/cli/cli.test.ts
git commit -m "feat: commander CLI (init/status/render/map/audit)"
```

---

## Phase 8 — 훅

### Task 11: SessionStart 훅 (마커 탐색 → 활성화 + CLI 경로 주입)

**Files:**

- Create: `src/hooks/sessionStart.ts`
- Test: `tests/hooks/sessionStart.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/hooks/sessionStart.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSessionStartOutput } from "../../src/hooks/sessionStart.js";
import { scaffoldInit } from "../../src/init/scaffold.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cp-"));
});

describe("buildSessionStartOutput", () => {
  it("init 안 된 프로젝트면 빈 출력(무동작)", async () => {
    const o = await buildSessionStartOutput(root, "/plugin");
    expect(o).toBeNull();
  });
  it("init 되면 활성화 컨텍스트와 CLI 경로를 담는다", async () => {
    await scaffoldInit(root, {});
    const o = await buildSessionStartOutput(root, "/plugin");
    const ctx = o!.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("Conceptpowers");
    expect(ctx).toContain("/plugin/dist/cli.js");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/hooks/sessionStart.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

```ts
// src/hooks/sessionStart.ts
import { join } from "node:path";
import { isInitialized } from "../init/scaffold.js";

export interface SessionStartOutput {
  hookSpecificOutput: {
    hookEventName: "SessionStart";
    additionalContext: string;
  };
}

export async function buildSessionStartOutput(
  root: string,
  pluginRoot: string,
): Promise<SessionStartOutput | null> {
  if (!(await isInitialized(root))) return null;
  const cli = join(pluginRoot, "dist", "cli.js");
  const context = [
    "<CONCEPTPOWERS-ACTIVE>",
    "이 프로젝트는 Conceptpowers 거버넌스가 활성화되어 있습니다(docs/conceptpowers/init.json 존재).",
    "규칙:",
    "- 새 기능·동작 변경 전 conceptpowers:check-concept 스킬로 관련 개념 위배 여부를 검증한다.",
    "- 관련 개념이 없으면 conceptpowers:define-concept로 먼저 정의한다.",
    "- 위배 시 코드를 수정하지 않고 사용자에게 개념 업데이트/기능 분리를 요청한다.",
    "- docs/conceptpowers/ 전체는 읽기 전용 기준이다. 수정은 사용자 명시 요청 시 conceptpowers:update-baseline으로만.",
    `- 결정론적 작업용 CLI: node "${cli}" <init|status|render|map|audit>`,
    "보완 관계: Conceptpowers는 superpowers의 워크플로(brainstorming→writing-plans→TDD)를 대체하지 않고 보완한다. 개념 정의/검증 게이트만 추가하며, 프로세스 스킬은 superpowers를 그대로 따른다.",
    "</CONCEPTPOWERS-ACTIVE>",
  ].join("\n");
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  };
}

const isMain =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const root = process.cwd();
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? join(process.cwd());
  buildSessionStartOutput(root, pluginRoot).then((o) => {
    if (o) process.stdout.write(JSON.stringify(o));
    process.exit(0);
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/hooks/sessionStart.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/sessionStart.ts tests/hooks/sessionStart.test.ts
git commit -m "feat: SessionStart 훅 (마커 탐색 → 활성화 컨텍스트 주입)"
```

### Task 12: PreToolUse 훅 (Edit/Write 리마인더 + git commit 게이트)

**Files:**

- Create: `src/hooks/preToolUse.ts`
- Test: `tests/hooks/preToolUse.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/hooks/preToolUse.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decidePreToolUse } from "../../src/hooks/preToolUse.js";
import { scaffoldInit } from "../../src/init/scaffold.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cp-"));
  mkdirSync(join(root, "src"), { recursive: true });
});

describe("decidePreToolUse", () => {
  it("init 안 된 프로젝트는 무동작(null)", async () => {
    const r = await decidePreToolUse(root, {
      tool: "Edit",
      input: { file_path: join(root, "src/a.ts") },
    });
    expect(r).toBeNull();
  });
  it("init 프로젝트의 Edit는 개념 검증 리마인더를 주입한다", async () => {
    await scaffoldInit(root, {});
    const r = await decidePreToolUse(root, {
      tool: "Edit",
      input: { file_path: join(root, "src/a.ts") },
    });
    expect(r!.hookSpecificOutput.additionalContext).toContain("check-concept");
  });
  it("git commit이면서 unknownTag가 있으면 deny한다", async () => {
    await scaffoldInit(root, {});
    writeFileSync(join(root, "src/a.ts"), "// @concept:ghost\n");
    const r = await decidePreToolUse(root, {
      tool: "Bash",
      input: { command: "git commit -m x" },
      changedFiles: ["src/a.ts"],
    });
    expect(r!.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain("ghost");
  });
  it("git commit이고 정합성 OK면 검증 리마인더만 주입(allow 유지)", async () => {
    await scaffoldInit(root, {});
    const r = await decidePreToolUse(root, {
      tool: "Bash",
      input: { command: "git commit -m x" },
      changedFiles: [],
    });
    expect(r!.hookSpecificOutput.additionalContext).toContain(
      "check-consistency",
    );
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/hooks/preToolUse.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

```ts
// src/hooks/preToolUse.ts
import { isInitialized } from "../init/scaffold.js";
import { auditIntegrity } from "../audit/audit.js";

export interface PreToolEvent {
  tool: string;
  input: { file_path?: string; command?: string };
  changedFiles?: string[];
}
export interface PreToolOutput {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision?: "allow" | "deny" | "ask";
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
}

const isGitCommit = (cmd?: string) => !!cmd && /\bgit\s+commit\b/.test(cmd);

export async function decidePreToolUse(
  root: string,
  ev: PreToolEvent,
): Promise<PreToolOutput | null> {
  if (!(await isInitialized(root))) return null;

  if (ev.tool === "Bash" && isGitCommit(ev.input.command)) {
    const files = ev.changedFiles ?? [];
    const report = await auditIntegrity(root, files);
    if (!report.ok) {
      const detail = report.unknownTags
        .map((t) => `${t.file} → @concept:${t.slug}(없음)`)
        .join(", ");
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `커밋 차단: 정의되지 않은 개념 태그 — ${detail}. 개념을 정의(define-concept)하거나 태그를 수정하세요.`,
        },
      };
    }
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        additionalContext:
          "커밋 게이트(D17): 스테이징 변경에 대해 check-concept(코드↔개념)와, 개념 변경 포함 시 check-consistency(개념↔개념)를 수행했는지 확인하고, 위배·충돌 0건일 때만 커밋하세요.",
      },
    };
  }

  if (ev.tool === "Edit" || ev.tool === "Write") {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext:
          "새 기능·동작 변경이면 먼저 conceptpowers:check-concept로 관련 개념 위배 여부를 검증하고, 코드 수정 시 @concept 태그/매핑을 함께 갱신하세요.",
      },
    };
  }
  return null;
}

const isMain =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", async () => {
    try {
      const payload = JSON.parse(raw || "{}");
      const ev: PreToolEvent = {
        tool: payload.tool_name,
        input: payload.tool_input ?? {},
      };
      const out = await decidePreToolUse(process.cwd(), ev);
      if (out) process.stdout.write(JSON.stringify(out));
    } catch {
      /* 무동작 */
    }
    process.exit(0);
  });
}
```

> 주: 훅 런타임에서 git commit의 정확한 변경 파일 목록은 stdin 페이로드에 없을 수 있다. 그 경우 `changedFiles`는 비고, deny는 발생하지 않으며 리마인더만 주입된다(안전한 기본값). 정확한 스테이징 검사는 audit 스킬/커밋 게이트 스킬이 `git diff --cached --name-only`로 수행한다.

- [ ] **Step 4: 통과 확인 + 빌드**

Run: `npx vitest run tests/hooks/preToolUse.test.ts && npm run build`
Expected: PASS (4 tests), 빌드 성공

- [ ] **Step 5: Commit**

```bash
git add src/hooks/preToolUse.ts tests/hooks/preToolUse.test.ts
git commit -m "feat: PreToolUse 훅 (Edit/Write 리마인더 + git commit 게이트)"
```

### Task 13: 훅 배선 (hooks.json + 래퍼)

**Files:**

- Create: `hooks/hooks.json`, `hooks/session-start`, `hooks/pre-tool-use`

- [ ] **Step 1: `hooks/hooks.json` 작성**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/sessionStart.js\"",
            "async": false
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/preToolUse.js\"",
            "async": false
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: 실행 래퍼 (POSIX) 작성 — 선택적 폴백**

`hooks/session-start`, `hooks/pre-tool-use` (실행권한 부여). hooks.json이 직접 node를 호출하므로 래퍼는 호환용 thin shim이다:

```bash
#!/usr/bin/env bash
set -euo pipefail
exec node "${CLAUDE_PLUGIN_ROOT}/dist/hooks/$(basename "$0" | sed 's/-\([a-z]\)/\U\1/g').js"
```

> 단순화를 위해 hooks.json에서 `node ${CLAUDE_PLUGIN_ROOT}/dist/hooks/*.js`를 직접 호출한다. 래퍼 파일은 생략 가능하며, 생략 시 본 Step은 건너뛴다.

- [ ] **Step 3: 수동 검증 (init된 임시 프로젝트로 훅 출력 확인)**

Run:

```bash
npm run build
TMP=$(mktemp -d); node dist/cli.js init --root "$TMP"
cd "$TMP" && CLAUDE_PLUGIN_ROOT="$OLDPWD" node "$OLDPWD/dist/hooks/sessionStart.js"; cd "$OLDPWD"
```

Expected: `CONCEPTPOWERS-ACTIVE` 컨텍스트 JSON 출력

- [ ] **Step 4: Commit**

```bash
git add hooks/
git commit -m "feat: 훅 배선 (hooks.json + 래퍼)"
```

---

## Phase 9 — 스킬 (의미 판단 계층)

> 각 스킬은 `skills/<name>/SKILL.md`. frontmatter `name`/`description`은 Claude Code가 자동 트리거에 사용한다.
> 스킬 본문은 에이전트가 따라야 할 절차이며, 결정론적 작업은 SessionStart가 주입한 CLI 경로로 호출한다.

### Task 14: init 스킬

**Files:** Create `skills/init/SKILL.md`

- [ ] **Step 1: SKILL.md 작성**

```markdown
---
name: conceptpowers-init
description: Use when the user wants to enable Conceptpowers governance on a project ("conceptpowers init", "개념 거버넌스 켜기", "concept 강제 활성화"). Scaffolds docs/conceptpowers and the activation marker.
---

# Conceptpowers: Init

이 프로젝트에 개념 기반 거버넌스를 **활성화**한다. (opt-in, D3/D15)

## 절차

1. 사용자에게 백필 모드를 확인한다 (기본 incremental):
   - **incremental**(기본): 스캐폴드+마커만. 누락 개념은 audit으로 점진 백필.
   - **strict**: 즉시 전체 백필 강제(레거시 큰 프로젝트는 부담 큼).
2. CLI로 스캐폴드한다 (CLI 경로는 세션 컨텍스트 `CONCEPTPOWERS-ACTIVE` 또는 플러그인 dist):
   `node "<cli>" init --root . --mode <incremental|strict>`
3. 생성 결과를 사용자에게 보고한다: `docs/conceptpowers/`의 5요소(init/features/concepts/architecture/infra).
4. **architecture.md / infra.md를 사용자가 채우도록 안내**한다(개념의 상위 기준).
5. strict 모드면 즉시 `conceptpowers-audit` 스킬을 이어서 실행한다.

## 주의

- `docs/conceptpowers/`는 이후 **읽기 전용 기준**이다. 수정은 update-baseline으로만.
- init.json이 이미 있으면 덮어쓰지 않는다(사용자 설정 보존).
```

- [ ] **Step 2: frontmatter 파싱 검증**

Run: `node -e "const fs=require('fs');const m=fs.readFileSync('skills/init/SKILL.md','utf8');if(!/^---[\s\S]*name:[\s\S]*description:[\s\S]*---/.test(m))process.exit(1)"`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add skills/init/SKILL.md
git commit -m "feat: init 스킬"
```

### Task 15: define-concept 스킬

**Files:** Create `skills/define-concept/SKILL.md`

- [ ] **Step 1: SKILL.md 작성**

```markdown
---
name: conceptpowers-define-concept
description: Use BEFORE adding a new feature/behavior/role/permission/term when no concept covers it in a Conceptpowers-active project. Defines a structured concept (설명/목적/핵심행동/운영원칙) and saves it after a consistency check.
---

# Conceptpowers: Define Concept

새 기능·동작·역할·권한·용어에 해당하는 개념이 없을 때, 개념을 먼저 정의한다. (규칙 2/6)

## 절차 (대화형)

1. `features/`의 관련 기능 명세를 확인한다. 없으면 사용자와 함께 한 줄 명세부터 정한다.
2. 개념의 **범주(category)**를 정한다: feature | behavior | role | permission | term (복수 가능).
3. 다음 구조를 사용자와 함께 채운다 (LGEHS Admin Role 예시 구조):
   - **설명**: 핵심 정의, 비유, 구성요소, 예시
   - **목적**: 존재 이유, 기대효과, 비전, 페인포인트
   - **핵심 행동**: 허용(allow) / 제한(restrict) / 상호작용
   - **운영 원칙**: 불변 원칙, 트레이드오프, 라이프사이클
4. slug(kebab-case, 전역 고유)과 group(도메인)을 정한다.
5. **무모순 검사**: `conceptpowers-check-consistency` 스킬을 실행해 기존 개념과 충돌·위배가 없는지 확인한다.
   - 충돌이 있으면 **저장하지 않고** 사용자에게 해소(개념 조정/분리)를 요청한다. (규칙 7)
6. 통과 시 JSON으로 저장한다. 개념 데이터 파일을 직접 쓰거나, 저장 후 뷰어를 재생성한다:
   `node "<cli>" render --root .`
7. 정의한 개념을 코드와 연결할 때 `@concept:<slug>` 태그를 사용하도록 안내한다.

## 산출물

- `docs/conceptpowers/concepts/data/<group>/<slug>.json` (스키마 준수)
- 갱신된 뷰어 HTML
```

- [ ] **Step 2: frontmatter 검증** (Task 14 Step 2와 동일 명령, 경로만 변경)

Run: `node -e "const fs=require('fs');if(!/name:[\s\S]*description:/.test(fs.readFileSync('skills/define-concept/SKILL.md','utf8')))process.exit(1)"`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add skills/define-concept/SKILL.md
git commit -m "feat: define-concept 스킬"
```

### Task 16: check-concept 스킬 (코드 ↔ 개념)

**Files:** Create `skills/check-concept/SKILL.md`

- [ ] **Step 1: SKILL.md 작성**

```markdown
---
name: conceptpowers-check-concept
description: Use BEFORE writing/modifying code (including tests) that adds a feature or changes behavior in a Conceptpowers-active project. Finds the related concept(s) and judges whether the change violates their allow/restrict/immutable rules.
---

# Conceptpowers: Check Concept (코드 ↔ 개념)

새 기능·동작 변경(테스트 포함)이 관련 개념을 위배하는지 판단한다. (규칙 3/8, D5/D14)

## 적용 범위

- **대상**: 새 기능 추가, 기존 동작 변경, 관련 테스트 작성.
- **제외**: 단순 리팩터링·오타·포맷 (D5).

## 절차

1. 변경 대상 파일에서 `@concept:<slug>` 태그를 확인한다(또는 `git diff` 대상).
   태그가 없으면 관련 개념을 `concepts/data/`에서 의미적으로 탐색한다.
2. 관련 개념이 **하나도 없으면** → `conceptpowers-define-concept`로 먼저 정의(규칙 2).
3. 관련 개념의 **actions.allow / actions.restrict / principle.immutableRules**를 읽는다.
4. 계획한 변경이 위 규칙을 위배하는지 판단한다:
   - **위배 없음** → 진행. 코드 수정 시 `@concept` 태그/매핑을 함께 갱신(update-mapping).
   - **위배** → **코드를 수정하지 않는다.** 사용자에게 보고하고 둘 중 택하게 한다:
     (a) 개념을 명시적으로 업데이트(update-baseline), 또는 (b) 새 기능/개념으로 분리.
5. 테스트가 개념과 충돌하면 조용히 통과시키지 말고 사용자에게 알린다(테스트 오류 vs 개념 갱신 필요).

## 금지

- 에이전트가 개념(baseline)을 임의로 수정해 변경을 정당화하지 않는다(규칙 4).
```

- [ ] **Step 2: frontmatter 검증**

Run: `node -e "const fs=require('fs');if(!/name:[\s\S]*description:/.test(fs.readFileSync('skills/check-concept/SKILL.md','utf8')))process.exit(1)"`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add skills/check-concept/SKILL.md
git commit -m "feat: check-concept 스킬 (코드↔개념 검증)"
```

### Task 17: check-consistency 스킬 (개념 ↔ 개념)

**Files:** Create `skills/check-consistency/SKILL.md`

- [ ] **Step 1: SKILL.md 작성**

```markdown
---
name: conceptpowers-check-consistency
description: Use when defining or modifying a concept in a Conceptpowers-active project, and as the commit gate. Compares the new/changed concept against all existing concepts to detect conflicts or violations; only passes when zero conflicts.
---

# Conceptpowers: Check Consistency (개념 ↔ 개념)

개념을 추가/수정할 때 기존 모든 개념과 충돌·위배가 없는지 검증한다. (규칙 7, D11/D17)

## 절차

1. `concepts/data/`의 모든 개념을 로드한다(또는 `node "<cli>" render` 전 단계로 목록 확보).
2. 대상(신규/수정) 개념과 기존 개념들을 대조해 다음을 점검한다:
   - **권한·역할 충돌**: 같은 권한을 한 개념은 허용(allow), 다른 개념은 제한(restrict)하는가?
   - **용어 충돌**: 같은 term을 서로 다르게 정의하는가?
   - **불변 원칙 위배**: 대상 개념이 다른 개념의 immutableRules를 깨는가?
   - **상호작용 모순**: relations로 연결된 개념 간 동작 설명이 어긋나는가?
3. 충돌이 **하나라도 있으면** → 생성/수정 **중단**, 충돌 목록과 함께 사용자에게 해소를 요청한다.
4. 충돌 0건일 때만 저장/커밋을 진행한다.

## 커밋 게이트 (D17)

- `git commit` 시, 스테이징(`git diff --cached --name-only`)에 개념 데이터 변경이 있으면 본 검사를 수행한다.
- 코드 변경은 check-concept이, 개념 변경은 본 스킬이 담당하여 **구멍 없이** 커밋을 검증한다.
```

- [ ] **Step 2: frontmatter 검증**

Run: `node -e "const fs=require('fs');if(!/name:[\s\S]*description:/.test(fs.readFileSync('skills/check-consistency/SKILL.md','utf8')))process.exit(1)"`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add skills/check-consistency/SKILL.md
git commit -m "feat: check-consistency 스킬 (개념↔개념 무모순)"
```

### Task 18: update-baseline 스킬 (사용자 전속)

**Files:** Create `skills/update-baseline/SKILL.md`

- [ ] **Step 1: SKILL.md 작성**

```markdown
---
name: conceptpowers-update-baseline
description: Use ONLY when the user explicitly asks to modify the baseline (a concept, feature spec, architecture, or infra) in a Conceptpowers-active project. The agent never modifies baseline on its own.
---

# Conceptpowers: Update Baseline (사용자 전속)

baseline(`docs/conceptpowers/` 전체)을 수정한다. (규칙 4)

## 전제

- **사용자가 명시적으로 수정을 요청**했을 때만 실행한다. 코드 작업 도중 임의 수정 금지.

## 절차

1. 어떤 baseline을 바꾸는지 확인한다: 개념 / 기능명세 / 아키텍처 / 인프라.
2. **개념을 수정하는 경우**:
   - 변경안을 적용하기 전에 `conceptpowers-check-consistency`로 다른 개념과 충돌·위배를 검사한다.
   - 충돌 0건일 때만 저장하고 뷰어를 재생성한다: `node "<cli>" render --root .`
   - 개념 변경이 기존 코드(@concept 연결)에 영향을 주면, 영향 범위를 사용자에게 보고한다.
3. **아키텍처/인프라/기능명세를 수정하는 경우**: 해당 변경이 개념을 바꿔야 하는지 사용자와 함께 검토한다(상위 기준이 하위 개념을 제약, D9).
4. 변경 내역을 사용자에게 요약 보고한다.
```

- [ ] **Step 2: frontmatter 검증**

Run: `node -e "const fs=require('fs');if(!/name:[\s\S]*description:/.test(fs.readFileSync('skills/update-baseline/SKILL.md','utf8')))process.exit(1)"`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add skills/update-baseline/SKILL.md
git commit -m "feat: update-baseline 스킬 (사용자 전속 기준 수정)"
```

### Task 19: update-mapping 스킬

**Files:** Create `skills/update-mapping/SKILL.md`

- [ ] **Step 1: SKILL.md 작성**

```markdown
---
name: conceptpowers-update-mapping
description: Use after modifying code to sync @concept tags and the mapping cache, or run manually to refresh concept↔code links in a Conceptpowers-active project.
---

# Conceptpowers: Update Mapping

`@concept` 태그(코드 측 진실)와 `mapping.json` 캐시를 동기화한다. (규칙 5, D6)

## 절차

1. 코드를 수정했다면 변경 파일에 적절한 `@concept:<slug>` 태그가 있는지 확인하고, 없으면 추가한다.
   - 태그는 관련 개념의 slug와 정확히 일치해야 한다(전역 고유).
2. 매핑 캐시를 재생성한다:
   `node "<cli>" map --root . <변경된 파일들...>`
   - 또는 전체 갱신이 필요하면 소스 전체를 인자로 넘긴다.
3. 정의되지 않은 개념을 가리키는 태그가 있으면(audit unknownTags), 개념을 정의(define-concept)하거나 태그를 고친다.

## 주의

- `mapping.json`은 **캐시**이며 baseline이 아니다. 진실은 코드의 `@concept` 태그다.
```

- [ ] **Step 2: frontmatter 검증**

Run: `node -e "const fs=require('fs');if(!/name:[\s\S]*description:/.test(fs.readFileSync('skills/update-mapping/SKILL.md','utf8')))process.exit(1)"`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add skills/update-mapping/SKILL.md
git commit -m "feat: update-mapping 스킬"
```

### Task 20: audit 스킬 (전체 감사)

**Files:** Create `skills/audit/SKILL.md`

- [ ] **Step 1: SKILL.md 작성**

```markdown
---
name: conceptpowers-audit
description: Use when the user wants a full project audit ("conceptpowers audit", "개념 전수 점검", "구멍 찾기") in a Conceptpowers-active project. Finds concept-less code (gaps) and verifies existing @concept links.
---

# Conceptpowers: Audit (전체 감사)

수동 실행. 프로젝트 전체를 점검해 ① 미연결 구멍, ② 기존 연결 정합성을 본다. (D13)

## 절차

1. **정합성(결정론적)**: 소스 전체에 대해 CLI 감사를 실행한다:
   `node "<cli>" audit --root . <소스 파일들...>`
   - `unknownTags`(없는 개념을 가리키는 태그)를 리포트한다.
2. **미연결 구멍(의미 판단)**: 소스를 훑어 개념이 필요한데 `@concept` 태그가 없는
   기능·동작·역할·권한·용어를 찾는다. 각 항목에 대해:
   - 관련 개념이 이미 있으면 → 태그 추가 제안(update-mapping).
   - 개념이 없으면 → define-concept 제안.
3. **기존 연결 검증(의미 판단)**: 각 `@concept` 연결에 대해 코드가 개념의 allow/restrict/불변원칙을
   준수하는지 표본 검증한다(check-concept 재사용).
4. **리포트**: 구멍 목록 + 위반 목록 + 권장 조치를 사용자에게 제시한다.
   - baseline은 읽기 전용이므로 개념 생성/수정은 사용자 확인 후 진행한다.

## 백필 모드

- incremental: 구멍을 리포트만 하고 점진 백필을 권장.
- strict: 모든 구멍을 즉시 해소하도록 강제(init strict 또는 사용자 요청 시).
```

- [ ] **Step 2: frontmatter 검증**

Run: `node -e "const fs=require('fs');if(!/name:[\s\S]*description:/.test(fs.readFileSync('skills/audit/SKILL.md','utf8')))process.exit(1)"`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add skills/audit/SKILL.md
git commit -m "feat: audit 스킬 (전체 감사)"
```

---

## Phase 10 — 패키징 & 문서

### Task 21: README + CLAUDE.md + 빌드 산출물 포함

**Files:** Create `README.md`, `CLAUDE.md`; Modify `.gitignore`(dist 배포 정책)

- [ ] **Step 1: 전체 빌드 & 테스트 통과 확인**

Run: `npm run build && npm test`
Expected: 빌드 성공, 모든 테스트 PASS, 커버리지 ≥80%

- [ ] **Step 2: `README.md` 작성 (설치/사용)**

```markdown
# Conceptpowers

개념(Concept) 기반 개발 거버넌스 Claude Code 플러그인.
코드를 바꾸기 전에 개념을 정의하고, 변경이 개념을 위배하지 않는지 강제 검증한다.

## 설치 (자체 마켓플레이스)

\`\`\`bash
/plugin marketplace add <user>/Conceptpowers
/plugin install conceptpowers@conceptpowers-dev
\`\`\`

## 사용

1. 프로젝트에서 활성화: `conceptpowers init` 스킬 호출 → `docs/conceptpowers/` 생성
2. 이후 새 기능·동작 변경 시 개념 검증이 자동 강제됨 (SessionStart 훅이 마커 자동 탐색)
3. 전체 점검: `conceptpowers audit`

## 구조

- 개념 데이터: `docs/conceptpowers/concepts/data/<group>/<slug>.json`
- 뷰어: `docs/conceptpowers/concepts/viewer/index.html`
- baseline 전체는 사용자 전속 수정.

자세한 설계: `docs/specs/2026-06-18-conceptpowers-design.md`
```

- [ ] **Step 3: `CLAUDE.md` 작성 (플러그인 개발자용 컨텍스트)**

```markdown
# Conceptpowers — 개발 노트

- 엔진: `src/` (TS, ESM). 빌드 `npm run build` → `dist/`.
- 훅은 `dist/hooks/*.js`를 직접 실행하므로 **배포 전 빌드 필수**.
- 테스트: `npm test` (vitest, 80%+).
- 스키마 변경 시 `src/schema/concept.ts`와 뷰어/감사 영향 확인.
- baseline(docs/conceptpowers) 수정은 사용자 전속 — 코드에서 임의 수정 금지.
```

- [ ] **Step 4: dist 배포 정책 결정**

플러그인은 훅 런타임에 `dist/`가 필요하다. 두 옵션 중 하나를 택한다:

- (권장) `.gitignore`에서 `dist/`를 제거하고 빌드 산출물을 커밋(설치 즉시 동작).
- 또는 설치 후 빌드 단계를 README에 안내.

권장안 적용:

```gitignore
node_modules/
coverage/
```

Run: `npm run build && git add -f dist`
Expected: `dist/cli.js`, `dist/hooks/*.js` 포함

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md .gitignore dist
git commit -m "docs: README/CLAUDE 및 dist 배포 산출물 포함"
```

### Task 22: 통합 스모크 테스트 (엔드투엔드)

**Files:** Create `tests/integration/smoke.test.ts`

- [ ] **Step 1: 실패하는 통합 테스트 작성**

```ts
// tests/integration/smoke.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli.js";
import { writeConcept } from "../../src/store/conceptStore.js";
import { decidePreToolUse } from "../../src/hooks/preToolUse.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cp-"));
  mkdirSync(join(root, "src"), { recursive: true });
});

describe("end-to-end", () => {
  it("init → 개념 작성 → render → 태그 커밋 게이트 통과", async () => {
    expect(await runCli(["init", "--root", root])).toBe(0);
    await writeConcept(root, {
      slug: "admin-role",
      group: "auth",
      category: ["role"],
      title: "Admin",
      description: { definition: "d" },
      purpose: { reason: "r" },
      actions: {},
      principle: {},
    });
    expect(await runCli(["render", "--root", root])).toBe(0);
    expect(
      existsSync(
        join(root, "docs/conceptpowers/concepts/viewer/auth/admin-role.html"),
      ),
    ).toBe(true);

    writeFileSync(join(root, "src/a.ts"), "// @concept:admin-role\n");
    const ok = await decidePreToolUse(root, {
      tool: "Bash",
      input: { command: "git commit -m x" },
      changedFiles: ["src/a.ts"],
    });
    expect(ok!.hookSpecificOutput.permissionDecision).toBe("allow");

    writeFileSync(join(root, "src/b.ts"), "// @concept:ghost\n");
    const blocked = await decidePreToolUse(root, {
      tool: "Bash",
      input: { command: "git commit -m x" },
      changedFiles: ["src/b.ts"],
    });
    expect(blocked!.hookSpecificOutput.permissionDecision).toBe("deny");
  });
});
```

- [ ] **Step 2: 실행 & 통과 확인**

Run: `npx vitest run tests/integration/smoke.test.ts`
Expected: PASS

- [ ] **Step 3: 전체 테스트 + 빌드 최종 확인**

Run: `npm test && npm run build`
Expected: 전체 PASS, 빌드 성공

- [ ] **Step 4: Commit**

```bash
git add tests/integration/smoke.test.ts
git commit -m "test: 엔드투엔드 스모크 테스트 (init→render→커밋 게이트)"
```

---

## Phase 11 — superpowers 호환 & 보완

> 목표: 두 플러그인을 **동시 설치**해도 충돌 없이, 서로 보완하며 쓰도록 보장한다.
> 충돌 가능 지점은 (1) 스킬 이름, (2) 훅 동시 등록, (3) 워크플로 중복이다.

### Task 23: 비충돌 검증 + 보완 가이드

**Files:**

- Create: `tests/compat/superpowers.test.ts`
- Create: `docs/superpowers-interop.md`
- Modify: `README.md` (상호운용 섹션 추가)

**충돌 방지 설계 (구현자 참고):**

- **스킬 이름**: 모든 Conceptpowers 스킬은 `conceptpowers-` 접두사를 쓴다(Task14~20). superpowers 스킬명(`brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `test-driven-development`, `systematic-debugging`, `using-superpowers`, `requesting-code-review`, `receiving-code-review`, `verification-before-completion`, `finishing-a-development-branch`, `using-git-worktrees`, `dispatching-parallel-agents`, `writing-skills`)과 겹치지 않는다.
- **훅**: Claude Code는 여러 플러그인의 SessionStart/PreToolUse 훅을 **모두** 실행한다(가산적, override 아님). Conceptpowers 훅은 `init.json`이 없으면 **무동작**(null 출력)이므로, init 안 한 프로젝트에서는 superpowers에 어떤 영향도 주지 않는다.
- **워크플로 분담**: 프로세스(아이디어→스펙→계획→TDD)는 superpowers가, **개념 정의/검증 게이트**는 Conceptpowers가 담당한다. Conceptpowers는 프로세스 스킬을 재정의하지 않는다.

- [ ] **Step 1: 비충돌 테스트 작성 (스킬명 접두사 + 미충돌)**

```ts
// tests/compat/superpowers.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SUPERPOWERS_SKILLS = new Set([
  "brainstorming",
  "writing-plans",
  "executing-plans",
  "subagent-driven-development",
  "test-driven-development",
  "systematic-debugging",
  "using-superpowers",
  "writing-skills",
  "requesting-code-review",
  "receiving-code-review",
  "verification-before-completion",
  "finishing-a-development-branch",
  "using-git-worktrees",
  "dispatching-parallel-agents",
]);

function skillNames(): string[] {
  const dir = "skills";
  return readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, "SKILL.md")))
    .map((d) => {
      const m = readFileSync(join(dir, d, "SKILL.md"), "utf8").match(
        /name:\s*(.+)/,
      );
      return m ? m[1].trim() : "";
    });
}

describe("superpowers 호환", () => {
  it("모든 스킬 이름은 conceptpowers- 접두사를 가진다", () => {
    for (const n of skillNames())
      expect(n.startsWith("conceptpowers-")).toBe(true);
  });
  it("superpowers 스킬 이름과 겹치지 않는다", () => {
    for (const n of skillNames()) expect(SUPERPOWERS_SKILLS.has(n)).toBe(false);
  });
});
```

- [ ] **Step 2: 실행 & 통과 확인**

Run: `npx vitest run tests/compat/superpowers.test.ts`
Expected: PASS (Task14~20 스킬이 모두 `conceptpowers-` 접두사이므로 통과)

- [ ] **Step 3: 보완 가이드 문서 작성**

```markdown
<!-- docs/superpowers-interop.md -->

# Conceptpowers ✕ Superpowers 함께 쓰기

두 플러그인은 충돌 없이 보완 관계로 동작한다.

## 역할 분담

| 단계            | superpowers                                           | Conceptpowers                                  |
| --------------- | ----------------------------------------------------- | ---------------------------------------------- |
| 아이디어 → 스펙 | brainstorming                                         | (스펙에서 핵심 **개념** 식별)                  |
| 스펙 → 계획     | writing-plans                                         | —                                              |
| 구현(TDD)       | test-driven-development / subagent-driven-development | check-concept으로 변경의 개념 위배 검증        |
| 개념 정의       | —                                                     | define-concept (+ check-consistency)           |
| 커밋            | —                                                     | 커밋 게이트(check-concept + check-consistency) |
| 점검            | requesting-code-review                                | audit(개념 구멍·정합성)                        |

## 권장 흐름

1. superpowers `brainstorming`으로 스펙을 만든다.
2. 스펙의 핵심 역할·권한·용어·기능을 Conceptpowers `define-concept`로 개념화한다(거버넌스 대상일 때).
3. superpowers `writing-plans` → TDD로 구현하되, 새 기능·동작 변경 시 Conceptpowers `check-concept`가 게이트한다.
4. 커밋 시 Conceptpowers 커밋 게이트가 코드·개념 정합성을 최종 확인한다.

## 충돌이 없는 이유

- 스킬 이름은 `conceptpowers-` 접두사로 분리된다.
- 훅은 가산적으로 실행되며, Conceptpowers 훅은 `init.json` 없으면 무동작이다.
- Conceptpowers는 superpowers의 프로세스 스킬을 재정의하지 않는다.
```

- [ ] **Step 4: README에 상호운용 섹션 추가**

`README.md` 끝에 추가:

```markdown
## superpowers와 함께 쓰기

Conceptpowers는 [superpowers](https://github.com/obra/superpowers)와 충돌 없이 보완한다.
superpowers가 개발 프로세스(아이디어→스펙→계획→TDD)를 이끌고, Conceptpowers가 개념 정의/검증 게이트를 더한다.
자세한 흐름: `docs/superpowers-interop.md`.
```

- [ ] **Step 5: 전체 테스트 확인 후 Commit**

Run: `npm test`
Expected: 전체 PASS

```bash
git add tests/compat/superpowers.test.ts docs/superpowers-interop.md README.md
git commit -m "feat: superpowers 비충돌 검증 및 보완 가이드"
```

---

## 검증 체크리스트 (Self-Review 결과)

- **스펙 커버리지**: D1(거버넌스)·D2(데이터+뷰어, Task5/6)·D3·D15(opt-in/활성화, Task8/11)·D4·D6(태그/매핑, Task7)·D5(범위, check-concept 스킬)·D7(정적 렌더, Task6)·D8(마켓플레이스, Task1)·D9(5요소, Task8)·D10(범주, Task2)·D11(무모순, Task17)·D12(그룹, Task2/4/5)·D13(감사, Task9/20)·D14(테스트 검증, Task16)·D16(백필 모드, Task8)·D17(커밋 게이트, Task12) — 전부 태스크에 대응.
- **불변 원칙 8개**: 규칙1~8이 스킬/훅/스키마에 반영됨.
- **타입 일관성**: `Concept`/`InitConfig`/`Mapping`/`AuditReport`/`PreToolEvent`/`SessionStartOutput`가 정의 태스크와 사용 태스크에서 일치.
- **미해소(OQ3)**: "새 기능·동작 변경" 판정 휴리스틱은 check-concept 스킬 본문(적용 범위/제외)에 명문화.

## 잔여 리스크 / 후속

- 훅 런타임에서 `git commit`의 정확한 스테이징 파일 목록을 stdin으로 받기 어려울 수 있음 → 커밋 게이트의 정밀 검사는 스킬이 `git diff --cached`로 보강(Task12 주석).
- 의미 판단(check-concept/consistency)의 품질은 개념 데이터의 명확성에 의존 → 스키마의 allow/restrict/immutableRules를 구체적으로 작성하도록 define-concept가 유도.

```

```
