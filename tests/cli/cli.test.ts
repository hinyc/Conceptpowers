// tests/cli/cli.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli.js";
import { writeConcept, readConcept } from "../../src/store/conceptStore.js";

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
  it("init --approval cli가 approvalMode를 기록한다", async () => {
    await runCli(["init", "--root", root, "--approval", "cli"]);
    const cfg = JSON.parse(
      readFileSync(join(root, "docs/conceptpowers/init.json"), "utf8"),
    );
    expect(cfg.approvalMode).toBe("cli");
  });
  it("approve가 cli 모드에서 개념을 green으로 승인한다", async () => {
    await runCli(["init", "--root", root, "--approval", "cli"]);
    await writeConcept(root, {
      slug: "admin-role", category: ["role"], title: "A",
      description: { definition: "d" }, purpose: { reason: "r" }, actions: {}, principle: {},
    } as any);
    const code = await runCli(["approve", "--root", root, "admin-role"]);
    expect(code).toBe(0);
    expect((await readConcept(root, "admin-role"))?.status).toBe("green");
  });
  it("approve가 manual 모드에서는 실패한다(코드 1)", async () => {
    await runCli(["init", "--root", root]); // 기본 manual
    await writeConcept(root, {
      slug: "admin-role", category: ["role"], title: "A",
      description: { definition: "d" }, purpose: { reason: "r" }, actions: {}, principle: {},
    } as any);
    const out: string[] = [];
    const code = await runCli(["approve", "--root", root, "admin-role"], (s) => out.push(s));
    expect(code).toBe(1);
    expect((await readConcept(root, "admin-role"))?.status).toBe("red"); // 변경 없음
  });
});
