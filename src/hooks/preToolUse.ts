// src/hooks/preToolUse.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isInitialized } from "../init/scaffold.js";
import { auditIntegrity } from "../audit/audit.js";

const execFileAsync = promisify(execFile);

export interface PreToolEvent {
  tool: string;
  input: { file_path?: string; command?: string };
  changedFiles?: string[];
}
export interface PreToolOutput {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision?: "allow" | "deny" | "ask";
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
}

const isGitCommit = (cmd?: string) => !!cmd && /\bgit\s+commit\b/.test(cmd);

async function stagedFiles(root: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["--no-pager", "diff", "--cached", "--name-only"],
      { cwd: root },
    );
    return stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function decidePreToolUse(
  root: string,
  ev: PreToolEvent,
): Promise<PreToolOutput | null> {
  if (!(await isInitialized(root))) return null;

  if (ev.tool === "Bash" && isGitCommit(ev.input.command)) {
    const files = ev.changedFiles ?? (await stagedFiles(root));
    const report = await auditIntegrity(root, files);
    if (!report.ok) {
      const detail = report.unknownTags
        .map((t) => `${t.file} → @concept:${t.slug} (undefined)`)
        .join(", ");
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `Commit blocked: undefined concept tag(s) — ${detail}. Define the concept (define-concept) or fix the tag.`,
        },
      };
    }
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        additionalContext:
          "Commit gate (D17): For the staged changes, confirm you ran check-concept (code↔concept) and, when concepts changed, check-consistency (concept↔concept); commit only when there are zero violations and conflicts.",
      },
    };
  }

  if (ev.tool === "Edit" || ev.tool === "Write") {
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext:
          "If this is a new feature or behavior change, first run conceptpowers:check-concept to verify related concepts aren't violated, and update the @concept tags/mapping together with the code change.",
      },
    };
  }
  return null;
}

const isMain =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", async () => {
    try {
      const payload = JSON.parse(raw || "{}");
      const ev: PreToolEvent = {
        tool: payload.tool_name,
        input: payload.tool_input ?? {},
      };
      const out = await decidePreToolUse(process.cwd(), ev);
      if (out) process.stdout.write(JSON.stringify(out));
    } catch {
      /* no-op */
    }
    process.exit(0);
  });
}
