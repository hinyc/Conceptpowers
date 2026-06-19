// tests/hooks/sessionStart.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSessionStartOutput } from "../../src/hooks/sessionStart.js";
import { scaffoldInit } from "../../src/init/scaffold.js";
import { writeConcept, readConcept } from "../../src/store/conceptStore.js";
import { writeFeature } from "../../src/store/featureStore.js";
import { writeLock } from "../../src/drift/lock.js";
import { contractHash } from "../../src/drift/hash.js";

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
    expect(ctx).toContain("check-concept");
  });
  it("reference/에 사용자 자료가 있으면 <CONCEPTPOWERS-REFERENCE> 블록을 넣는다", async () => {
    await scaffoldInit(root, {});
    writeFileSync(join(root, "docs/conceptpowers/reference/glossary.md"), "용어집");
    const o = await buildSessionStartOutput(root, "/plugin");
    const ctx = o!.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("<CONCEPTPOWERS-REFERENCE>");
    expect(ctx).toContain("glossary.md");
    expect(ctx).toContain("untrusted");
  });
  it("reference/에 seed README만 있으면 블록이 없다", async () => {
    await scaffoldInit(root, {});
    const o = await buildSessionStartOutput(root, "/plugin");
    expect(o!.hookSpecificOutput.additionalContext).not.toContain("<CONCEPTPOWERS-REFERENCE>");
  });
  it("ko면 Output language 디렉티브가 Korean이다 (기본)", async () => {
    await scaffoldInit(root, {});
    const o = await buildSessionStartOutput(root, "/plugin");
    const ctx = o!.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("Output language");
    expect(ctx).toContain("Korean");
  });
  it("en이면 Output language 디렉티브가 English이다", async () => {
    await scaffoldInit(root, { locale: "en" });
    const o = await buildSessionStartOutput(root, "/plugin");
    const ctx = o!.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("Output language");
    expect(ctx).toContain("English");
  });
  it("보류(pending) 잔존과 자동승인 금지 규칙을 컨텍스트에 담는다", async () => {
    await scaffoldInit(root, {});
    await writeConcept(root, {
      slug: "red-one", category: ["feature"], title: "R",
      description: { definition: "d" }, purpose: { reason: "r" }, actions: {}, principle: {}, status: "red",
    } as any);
    await writeConcept(root, {
      slug: "pending-one", category: ["feature"], title: "P",
      description: { definition: "d" }, purpose: { reason: "r" }, actions: {}, principle: {}, status: "pending",
    } as any);
    const o = await buildSessionStartOutput(root, "/plugin");
    const ctx = o!.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("pending-one");
    expect(ctx).toContain("pending");
    expect(ctx).not.toContain("approvalMode");
    expect(ctx).toContain("Never auto-approve");
  });
  it("drift가 있으면 <CONCEPT-DRIFT> 블록과 이유를 주입한다", async () => {
    await scaffoldInit(root, {});
    await writeConcept(root, {
      slug: "auth-token", category: ["behavior"], title: "A",
      description: { definition: "v1" }, purpose: { reason: "r" }, actions: {}, principle: {},
    } as any);
    const c1 = await readConcept(root, "auth-token");
    await writeLock(root, { "auth-token": { hash: contractHash(c1!), at: "t" } });
    await writeFeature(root, { slug: "login", title: "L", concepts: ["auth-token"], codePaths: ["src/login.ts"] } as any);
    await writeConcept(root, {
      slug: "auth-token", category: ["behavior"], title: "A",
      description: { definition: "v2" }, purpose: { reason: "r" }, actions: {}, principle: {},
    } as any);
    const o = await buildSessionStartOutput(root, root);
    expect(o!.hookSpecificOutput.additionalContext).toContain("<CONCEPT-DRIFT>");
    expect(o!.hookSpecificOutput.additionalContext).toContain("auth-token");
  });
  it("drift가 없으면 <CONCEPT-DRIFT> 블록이 없다", async () => {
    await scaffoldInit(root, {});
    const o = await buildSessionStartOutput(root, root);
    expect(o!.hookSpecificOutput.additionalContext).not.toContain("<CONCEPT-DRIFT>");
  });
});

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

  it("CONCEPTPOWERS_NO_VERSION_CHECK=1이면 조회 자체를 안 한다", async () => {
    await scaffoldInit(root, {});
    const prev = process.env.CONCEPTPOWERS_NO_VERSION_CHECK;
    try {
      process.env.CONCEPTPOWERS_NO_VERSION_CHECK = "1";
      let called = false;
      const o = await buildSessionStartOutput(root, "/plugin", {
        checkForUpdate: async () => { called = true; return { installed: "0.1.0", latest: "9.9.9" }; },
      });
      expect(called).toBe(false);
      expect(o!.hookSpecificOutput.additionalContext).not.toContain("<CONCEPTPOWERS-UPDATE>");
    } finally {
      if (prev === undefined) {
        delete process.env.CONCEPTPOWERS_NO_VERSION_CHECK;
      } else {
        process.env.CONCEPTPOWERS_NO_VERSION_CHECK = prev;
      }
    }
  });
});
