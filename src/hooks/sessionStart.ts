// src/hooks/sessionStart.ts
import { join } from "node:path";
import { isInitialized } from "../init/scaffold.js";

export interface SessionStartOutput {
  hookSpecificOutput: {
    hookEventName: "SessionStart";
    additionalContext: string;
  };
}

export async function buildSessionStartOutput(
  root: string,
  pluginRoot: string,
): Promise<SessionStartOutput | null> {
  if (!(await isInitialized(root))) return null;
  const cli = join(pluginRoot, "dist", "cli.js");
  const context = [
    "<CONCEPTPOWERS-ACTIVE>",
    "이 프로젝트는 Conceptpowers 거버넌스가 활성화되어 있습니다(docs/conceptpowers/init.json 존재).",
    "규칙:",
    "- 새 기능·동작 변경 전 conceptpowers:check-concept 스킬로 관련 개념 위배 여부를 검증한다.",
    "- 관련 개념이 없으면 conceptpowers:define-concept로 먼저 정의한다.",
    "- 위배 시 코드를 수정하지 않고 사용자에게 개념 업데이트/기능 분리를 요청한다.",
    "- docs/conceptpowers/ 전체는 읽기 전용 기준이다. 수정은 사용자 명시 요청 시 conceptpowers:update-baseline으로만.",
    `- 결정론적 작업용 CLI: node "${cli}" <init|status|render|map|audit>`,
    "보완 관계: Conceptpowers는 superpowers의 워크플로(brainstorming→writing-plans→TDD)를 대체하지 않고 보완한다. 개념 정의/검증 게이트만 추가하며, 프로세스 스킬은 superpowers를 그대로 따른다.",
    "</CONCEPTPOWERS-ACTIVE>",
  ].join("\n");
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  };
}

const isMain =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const root = process.cwd();
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? join(process.cwd());
  buildSessionStartOutput(root, pluginRoot).then((o) => {
    if (o) process.stdout.write(JSON.stringify(o));
    process.exit(0);
  });
}
