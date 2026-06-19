// tests/cli/cli.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli.js";
import { writeConcept, readConcept } from "../../src/store/conceptStore.js";
import { readHistory } from "../../src/drift/history.js";

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
  it("sync 서브커맨드가 생성물을 패치한다 (초기화된 프로젝트)", async () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({
      name: "demo",
      scripts: { "concepts:view": "open docs/conceptpowers/concepts/viewer/index.html" },
    }));
    await runCli(["init", "--root", root]);
    let captured = "";
    const code = await runCli(["sync", "--root", root], (s) => (captured += s));
    expect(code).toBe(0);
    const r = JSON.parse(captured);
    expect(r.ok).toBe(true);
    expect(r).toHaveProperty("scriptStatus");
    expect(r).toHaveProperty("orphansRemoved");
  });
  it("sync는 초기화되지 않은 프로젝트에서 에러를 반환한다", async () => {
    let captured = "";
    const code = await runCli(["sync", "--root", root], (s) => (captured += s));
    expect(code).toBe(1);
    expect(JSON.parse(captured).error).toContain("not initialized");
  });
  it("init 완료 후 안내 문구를 출력한다 (package.json 있으면 뷰어 스크립트 안내)", async () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "demo" }));
    let captured = "";
    const code = await runCli(["init", "--root", root, "--lang", "ko"], (s) => (captured += s));
    expect(code).toBe(0);
    expect(captured).toContain("초기화 완료");
    expect(captured).toContain("npm run concepts:view");
    expect(captured).toContain("reference/"); // 참고자료 폴더 안내
  });
  it("package.json이 없으면 안내가 뷰어 파일 경로를 가리킨다", async () => {
    let captured = "";
    await runCli(["init", "--root", root, "--lang", "ko"], (s) => (captured += s));
    expect(captured).toContain("docs/conceptpowers/concepts/viewer/index.html");
    expect(captured).not.toContain("npm run concepts:view");
  });
  it("--lang en이면 영어 안내를 출력한다", async () => {
    let captured = "";
    await runCli(["init", "--root", root, "--lang", "en"], (s) => (captured += s));
    expect(captured).toContain("Conceptpowers initialized");
  });
  it("status가 초기화 여부를 JSON으로 출력한다", async () => {
    const out: string[] = [];
    const code = await runCli(["status", "--root", root], (s) => out.push(s));
    expect(code).toBe(0);
    expect(JSON.parse(out.join("")).initialized).toBe(false);
  });
  it("approve가 red 개념을 green으로 승인한다", async () => {
    await runCli(["init", "--root", root]);
    await writeConcept(root, {
      slug: "admin-role", group: "auth", category: ["role"], title: "Admin",
      description: { definition: "d" }, purpose: { reason: "r" },
      actions: {}, principle: {}, status: "red",
    });
    const code = await runCli(["approve", "--root", root, "admin-role"]);
    expect(code).toBe(0);
    const c = await readConcept(root, "admin-role");
    expect(c?.status).toBe("green");
  });
  it("status는 drift 개수를 포함한다", async () => {
    let captured = "";
    await runCli(["init", "--root", root], () => {});
    const code = await runCli(["status", "--root", root], (s) => (captured += s));
    expect(code).toBe(0);
    expect(JSON.parse(captured)).toMatchObject({ initialized: true, drift: 0 });
  });
  it("note-change는 history에 이유를 기록한다", async () => {
    await runCli(["init", "--root", root], () => {});
    await writeConcept(root, {
      slug: "auth-token", category: ["behavior"], title: "A",
      description: { definition: "d" }, purpose: { reason: "r" }, actions: {}, principle: {},
    } as any);
    await runCli(["note-change", "auth-token", "--reason", "만료 30분", "--root", root], () => {});
    const h = await readHistory(root);
    expect(h.some((e) => e.slug === "auth-token" && e.reason === "만료 30분")).toBe(true);
  });
  it("drift는 JSON 배열을 출력한다", async () => {
    let captured = "";
    await runCli(["init", "--root", root], () => {});
    await runCli(["drift", "--root", root], (s) => (captured += s));
    expect(JSON.parse(captured)).toEqual([]);
  });
  it("note-conflict/resolve-conflict가 사유를 기록·해소한다", async () => {
    await runCli(["init", "--root", root]);
    expect(await runCli(["note-conflict", "p", "--reason", "x", "--root", root])).toBe(0);
    const { readPendingConflicts } = await import("../../src/concept/pendingConflicts.js");
    expect(await readPendingConflicts(root)).toEqual({ p: "x" });
    await runCli(["resolve-conflict", "p", "--root", root]);
    expect(await readPendingConflicts(root)).toEqual({});
  });
});
