// tests/integration/smoke.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
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
    // 개념은 개별 HTML이 아니라 manifest.json에 등록되고 단일 뷰어가 렌더한다.
    expect(
      existsSync(join(root, "docs/conceptpowers/concepts/viewer/index.html")),
    ).toBe(true);
    const manifest = JSON.parse(
      readFileSync(
        join(root, "docs/conceptpowers/concepts/viewer/manifest.json"),
        "utf8",
      ),
    );
    expect(manifest.concepts[0].url).toBe("../data/auth/admin-role.json");

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
    // 미정의 태그는 막되 override 허용(ask) — 강제된 내비게이션
    expect(blocked!.hookSpecificOutput.permissionDecision).toBe("ask");
  });

  it("init → feature 작성 → concept 정의 → map → render: 그래프에 3종 엣지가 모두 생긴다", async () => {
    expect(await runCli(["init", "--root", root])).toBe(0);

    // 개념(개념→코드는 @concept 태그 + map으로 배선)
    await writeConcept(root, {
      slug: "auth-session", group: "auth", category: ["feature"], title: "세션",
      description: { definition: "d" }, purpose: { reason: "r" },
      actions: {}, principle: {}, status: "green",
    });

    // 기능(기능→개념: concepts, 기능→코드: codePaths)
    const spec = join(root, "feat.json");
    writeFileSync(spec, JSON.stringify({
      slug: "login", group: "auth", title: "로그인",
      concepts: ["auth-session"], codePaths: ["src/login.ts"],
    }));
    expect(await runCli(["feature", "--root", root, "--file", spec])).toBe(0);

    // @concept 태그 → mapping.json (개념→코드)
    writeFileSync(join(root, "src/login.ts"), "// @concept:auth-session\n");
    expect(await runCli(["map", "--root", root, "src/login.ts"])).toBe(0);

    expect(await runCli(["render", "--root", root])).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(root, "docs/conceptpowers/concepts/viewer/manifest.json"), "utf8"),
    );
    const kinds = new Set(manifest.graph.edges.map((e: { kind: string }) => e.kind));
    expect(kinds.has("feature-concept")).toBe(true);
    expect(kinds.has("feature-file")).toBe(true);
    expect(kinds.has("concept-file")).toBe(true);
    // 같은 파일(src/login.ts)을 기능·개념이 공유 → 파일 노드는 하나로 합쳐진다
    expect(
      manifest.graph.nodes.filter((n: { id: string }) => n.id === "p:src/login.ts").length,
    ).toBe(1);
  });
});
