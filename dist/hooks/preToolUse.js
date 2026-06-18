// src/hooks/preToolUse.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isInitialized } from "../init/scaffold.js";
import { auditIntegrity } from "../audit/audit.js";
const execFileAsync = promisify(execFile);
const isGitCommit = (cmd) => !!cmd && /\bgit\s+commit\b/.test(cmd);
async function stagedFiles(root) {
    try {
        const { stdout } = await execFileAsync("git", ["--no-pager", "diff", "--cached", "--name-only"], { cwd: root });
        return stdout
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
    }
    catch {
        return [];
    }
}
export async function decidePreToolUse(root, ev) {
    if (!(await isInitialized(root)))
        return null;
    if (ev.tool === "Bash" && isGitCommit(ev.input.command)) {
        const files = ev.changedFiles ?? (await stagedFiles(root));
        const report = await auditIntegrity(root, files);
        if (!report.ok) {
            const detail = report.unknownTags
                .map((t) => `${t.file} → @concept:${t.slug}(없음)`)
                .join(", ");
            return {
                hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason: `커밋 차단: 정의되지 않은 개념 태그 — ${detail}. 개념을 정의(define-concept)하거나 태그를 수정하세요.`,
                },
            };
        }
        return {
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "allow",
                additionalContext: "커밋 게이트(D17): 스테이징 변경에 대해 check-concept(코드↔개념)와, 개념 변경 포함 시 check-consistency(개념↔개념)를 수행했는지 확인하고, 위배·충돌 0건일 때만 커밋하세요.",
            },
        };
    }
    if (ev.tool === "Edit" || ev.tool === "Write") {
        return {
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                additionalContext: "새 기능·동작 변경이면 먼저 conceptpowers:check-concept로 관련 개념 위배 여부를 검증하고, 코드 수정 시 @concept 태그/매핑을 함께 갱신하세요.",
            },
        };
    }
    return null;
}
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
    let raw = "";
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", async () => {
        try {
            const payload = JSON.parse(raw || "{}");
            const ev = {
                tool: payload.tool_name,
                input: payload.tool_input ?? {},
            };
            const out = await decidePreToolUse(process.cwd(), ev);
            if (out)
                process.stdout.write(JSON.stringify(out));
        }
        catch {
            /* 무동작 */
        }
        process.exit(0);
    });
}
//# sourceMappingURL=preToolUse.js.map