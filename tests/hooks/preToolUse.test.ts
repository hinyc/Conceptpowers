// tests/hooks/preToolUse.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decidePreToolUse } from "../../src/hooks/preToolUse.js";
import { scaffoldInit } from "../../src/init/scaffold.js";
import { writeConcept } from "../../src/store/conceptStore.js";

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
  it("git commit이면서 unknownTag가 있으면 deny한다 (changedFiles 제공)", async () => {
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
  it("staged 파일이 미승인(red) 개념을 참조하면 경고하며 ask로 확인을 요구한다", async () => {
    await scaffoldInit(root, {});
    await writeConcept(root, {
      slug: "red-one", category: ["feature"], title: "R",
      description: { definition: "d" }, purpose: { reason: "r" }, actions: {}, principle: {}, status: "red",
    } as any);
    writeFileSync(join(root, "src/a.ts"), "// @concept:red-one\n");
    const r = await decidePreToolUse(root, {
      tool: "Bash",
      input: { command: "git commit -m x" },
      changedFiles: ["src/a.ts"],
    });
    expect(r!.hookSpecificOutput.permissionDecision).toBe("ask");
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain("red-one");
  });
  it("changedFiles 미제공 시 스테이징된 파일을 직접 조회하여 unknownTag가 있으면 deny한다 (C1)", async () => {
    await scaffoldInit(root, {});
    // git init a temp repo so we can stage files
    execSync("git init", { cwd: root });
    execSync('git config user.email "test@test.com"', { cwd: root });
    execSync('git config user.name "Test"', { cwd: root });
    writeFileSync(join(root, "src/a.ts"), "// @concept:ghost\n");
    execSync("git add src/a.ts", { cwd: root });
    // changedFiles is NOT passed — hook must derive from git diff --cached
    const r = await decidePreToolUse(root, {
      tool: "Bash",
      input: { command: "git commit -m x" },
    });
    expect(r!.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain("ghost");
  });
});
