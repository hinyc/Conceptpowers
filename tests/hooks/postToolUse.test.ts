import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPostToolUse } from "../../src/hooks/postToolUse.js";
import { scaffoldInit } from "../../src/init/scaffold.js";
import { writeConcept, readConcept } from "../../src/store/conceptStore.js";
import { writeFeature } from "../../src/store/featureStore.js";
import { writeLock, readLock } from "../../src/drift/lock.js";
import { contractHash } from "../../src/drift/hash.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "cp-")); });

describe("runPostToolUse", () => {
  it("init 안 됐으면 null", async () => {
    const r = await runPostToolUse(root, { tool: "Bash", input: { command: "git commit -m x" } });
    expect(r).toBeNull();
  });
  it("git commit이 아니면 null", async () => {
    await scaffoldInit(root, {});
    const r = await runPostToolUse(root, { tool: "Bash", input: { command: "ls" } });
    expect(r).toBeNull();
  });
  it("커밋 후 drift를 재조정한다(관련 코드 포함→aligned, lock 갱신)", async () => {
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
    const c2 = await readConcept(root, "auth-token");
    const r = await runPostToolUse(root, {
      tool: "Bash", input: { command: "git commit -m x" }, committedFiles: ["src/login.ts"],
    });
    expect(r!.aligned).toContain("auth-token");
    expect((await readLock(root))["auth-token"].hash).toBe(contractHash(c2!));
  });
});
