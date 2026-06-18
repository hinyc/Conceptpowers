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
});
