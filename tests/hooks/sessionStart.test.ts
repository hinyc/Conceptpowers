// tests/hooks/sessionStart.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
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
  it("미승인(red) 개념 수와 approvalMode 규칙을 컨텍스트에 담는다", async () => {
    await scaffoldInit(root, {});
    await writeConcept(root, {
      slug: "red-one", category: ["feature"], title: "R",
      description: { definition: "d" }, purpose: { reason: "r" }, actions: {}, principle: {}, status: "red",
    } as any);
    const o = await buildSessionStartOutput(root, "/plugin");
    const ctx = o!.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("red-one");
    expect(ctx).toContain("approvalMode");
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
