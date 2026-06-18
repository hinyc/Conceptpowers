// tests/compat/superpowers.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SUPERPOWERS_SKILLS = new Set([
  "brainstorming",
  "writing-plans",
  "executing-plans",
  "subagent-driven-development",
  "test-driven-development",
  "systematic-debugging",
  "using-superpowers",
  "writing-skills",
  "requesting-code-review",
  "receiving-code-review",
  "verification-before-completion",
  "finishing-a-development-branch",
  "using-git-worktrees",
  "dispatching-parallel-agents",
]);

function skillNames(): string[] {
  const dir = "skills";
  return readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, "SKILL.md")))
    .map((d) => {
      const m = readFileSync(join(dir, d, "SKILL.md"), "utf8").match(
        /name:\s*(.+)/,
      );
      return m ? m[1].trim() : "";
    });
}

describe("superpowers 호환", () => {
  it("모든 스킬 이름은 conceptpowers- 접두사를 가진다", () => {
    for (const n of skillNames())
      expect(n.startsWith("conceptpowers-")).toBe(true);
  });
  it("superpowers 스킬 이름과 겹치지 않는다", () => {
    for (const n of skillNames()) expect(SUPERPOWERS_SKILLS.has(n)).toBe(false);
  });
});
