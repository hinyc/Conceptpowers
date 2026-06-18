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
