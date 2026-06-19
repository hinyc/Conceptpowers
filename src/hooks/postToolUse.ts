import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isInitialized } from "../init/scaffold.js";
import { reconcileAfterCommit, type ReconcileResult } from "../drift/reconcile.js";

const execFileAsync = promisify(execFile);
const isGitCommit = (cmd?: string) => !!cmd && /\bgit\s+commit\b/.test(cmd);

export interface PostToolEvent {
  tool: string;
  input: { command?: string };
  committedFiles?: string[];
}

async function committedFiles(root: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["--no-pager", "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"],
      { cwd: root },
    );
    return stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function runPostToolUse(
  root: string,
  ev: PostToolEvent,
): Promise<ReconcileResult | null> {
  if (!(await isInitialized(root))) return null;
  if (!(ev.tool === "Bash" && isGitCommit(ev.input.command))) return null;
  const files = ev.committedFiles ?? (await committedFiles(root));
  try {
    return await reconcileAfterCommit(root, files);
  } catch {
    return null; // best-effort: 이미 커밋은 끝났다
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", async () => {
    try {
      const payload = JSON.parse(raw || "{}");
      await runPostToolUse(process.cwd(), {
        tool: payload.tool_name,
        input: payload.tool_input ?? {},
      });
    } catch {
      /* no-op */
    }
    process.exit(0);
  });
}
