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
