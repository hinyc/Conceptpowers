import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPostToolUse } from "../../src/hooks/postToolUse.js";
import { scaffoldInit } from "../../src/init/scaffold.js";
import { writeConcept, readConcept } from "../../src/store/conceptStore.js";
import { writeFeature } from "../../src/store/featureStore.js";
import { writeLock, readLock } from "../../src/drift/lock.js";
import { readHistory } from "../../src/drift/history.js";
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

  it("실제 커밋이 없으면(HEAD 불변) 재조정하지 않는다 — 실패 커밋 보호 (C1)", async () => {
    execSync("git init -q", { cwd: root });
    execSync('git config user.email "t@t.com"', { cwd: root });
    execSync('git config user.name "T"', { cwd: root });
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
    // 실제 커밋: 개념 파일만 커밋(관련 코드 미반영) → override 시나리오
    execSync("git add -A", { cwd: root });
    execSync('git commit -q -m "change concept"', { cwd: root });
    const first = await runPostToolUse(root, { tool: "Bash", input: { command: "git commit -m x" } });
    expect(first!.ignored).toContain("auth-token"); // 코드 미반영 → ignored
    const histLen = (await readHistory(root)).length;
    // 두 번째 호출: HEAD 그대로(새 커밋 없음) → 아무것도 안 함
    const second = await runPostToolUse(root, { tool: "Bash", input: { command: "git commit -m x" } });
    expect(second).toBeNull();
    expect((await readHistory(root)).length).toBe(histLen); // 중복 ignored 기록 없음
  });
});
