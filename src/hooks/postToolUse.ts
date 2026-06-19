import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { isInitialized } from "../init/scaffold.js";
import { reconcileAfterCommit, type ReconcileResult } from "../drift/reconcile.js";
import { cpPaths } from "../paths.js";
import { writeFileAtomic } from "../util/atomicWrite.js";

const execFileAsync = promisify(execFile);
const isGitCommit = (cmd?: string) => !!cmd && /\bgit\s+commit\b/.test(cmd);

export interface PostToolEvent {
  tool: string;
  input: { command?: string };
  committedFiles?: string[];
}

async function git(root: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["--no-pager", ...args], { cwd: root });
    return stdout;
  } catch {
    return null;
  }
}

async function headSha(root: string): Promise<string | null> {
  const out = await git(root, ["rev-parse", "HEAD"]);
  return out ? out.trim() : null;
}

// 머지 커밋(부모 2개 이상)이면 diff-tree 파일목록이 비거나 모호하므로 신뢰하지 않는다.
async function isMergeCommit(root: string): Promise<boolean> {
  const out = await git(root, ["rev-list", "--parents", "-n", "1", "HEAD"]);
  if (!out) return false;
  return out.trim().split(/\s+/).length > 2; // sha + parent(s)
}

async function committedFiles(root: string): Promise<string[]> {
  // --root: 최초(부모 없는) 커밋도 파일 목록을 내도록 한다.
  const out = await git(root, ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "HEAD"]);
  if (!out) return [];
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

async function readLastCommit(root: string): Promise<string> {
  try {
    return (await readFile(cpPaths(root).alignmentLastCommit, "utf8")).trim();
  } catch {
    return "";
  }
}

async function writeLastCommit(root: string, sha: string): Promise<void> {
  try {
    await writeFileAtomic(cpPaths(root).alignmentLastCommit, sha + "\n");
  } catch {
    /* best-effort */
  }
}

export async function runPostToolUse(
  root: string,
  ev: PostToolEvent,
): Promise<ReconcileResult | null> {
  if (!(await isInitialized(root))) return null;
  if (!(ev.tool === "Bash" && isGitCommit(ev.input.command))) return null;

  // 명시적 파일목록(테스트/프로그램 경로)은 그대로 신뢰한다.
  if (ev.committedFiles) {
    try {
      return await reconcileAfterCommit(root, ev.committedFiles);
    } catch {
      return null;
    }
  }

  // 실제 경로: 새 커밋이 정말 생겼고(실패/중복 커밋 배제), 머지가 아니며,
  // 파일목록을 확보했을 때만 재조정한다 — 그래야 코드 미반영을 잘못 '해소'하지 않는다.
  const sha = await headSha(root);
  if (!sha) return null;
  if (sha === (await readLastCommit(root))) return null; // 새 커밋 없음 = 실패/중복
  if (await isMergeCommit(root)) {
    await writeLastCommit(root, sha);
    return null;
  }
  const files = await committedFiles(root);
  if (files.length === 0) {
    await writeLastCommit(root, sha);
    return null;
  }
  try {
    const res = await reconcileAfterCommit(root, files);
    await writeLastCommit(root, sha);
    return res;
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
