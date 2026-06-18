// tests/integration/smoke.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli.js";
import { writeConcept } from "../../src/store/conceptStore.js";
import { decidePreToolUse } from "../../src/hooks/preToolUse.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cp-"));
  mkdirSync(join(root, "src"), { recursive: true });
});

describe("end-to-end", () => {
  it("init → 개념 작성 → render → 태그 커밋 게이트 통과", async () => {
    expect(await runCli(["init", "--root", root])).toBe(0);
    await writeConcept(root, {
      slug: "admin-role",
      group: "auth",
      category: ["role"],
      title: "Admin",
      description: { definition: "d" },
      purpose: { reason: "r" },
      actions: {},
      principle: {},
      status: "green", // 승인된 개념 → 커밋 게이트 통과
    });
    expect(await runCli(["render", "--root", root])).toBe(0);
    expect(
      existsSync(
        join(root, "docs/conceptpowers/concepts/viewer/auth/admin-role.html"),
      ),
    ).toBe(true);

    writeFileSync(join(root, "src/a.ts"), "// @concept:admin-role\n");
    const ok = await decidePreToolUse(root, {
      tool: "Bash",
      input: { command: "git commit -m x" },
      changedFiles: ["src/a.ts"],
    });
    expect(ok!.hookSpecificOutput.permissionDecision).toBe("allow");

    writeFileSync(join(root, "src/b.ts"), "// @concept:ghost\n");
    const blocked = await decidePreToolUse(root, {
      tool: "Bash",
      input: { command: "git commit -m x" },
      changedFiles: ["src/b.ts"],
    });
    expect(blocked!.hookSpecificOutput.permissionDecision).toBe("deny");
  });
});
