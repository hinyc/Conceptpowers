// tests/cli/feature.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cp-feat-"));
});

const writeSpec = (name: string, data: unknown): string => {
  const p = join(root, name);
  writeFileSync(p, JSON.stringify(data));
  return p;
};

describe("runCli feature", () => {
  it("유효한 feature를 검증해 features/에 기록한다", async () => {
    await runCli(["init", "--root", root]);
    const file = writeSpec("login.json", {
      slug: "login",
      group: "auth",
      title: "로그인",
      concepts: ["auth-session"],
      codePaths: ["src/login.ts"],
    });
    let captured = "";
    const code = await runCli(
      ["feature", "--root", root, "--file", file],
      (s) => (captured += s),
    );
    expect(code).toBe(0);
    expect(JSON.parse(captured)).toMatchObject({ ok: true, slug: "login" });
    const target = join(root, "docs/conceptpowers/features/auth/login.json");
    expect(existsSync(target)).toBe(true);
    const written = JSON.parse(readFileSync(target, "utf8"));
    expect(written.concepts).toEqual(["auth-session"]);
    expect(written.codePaths).toEqual(["src/login.ts"]);
  });

  it("스키마 위반 feature는 비0 종료코드로 거부한다", async () => {
    await runCli(["init", "--root", root]);
    const file = writeSpec("bad.json", { slug: "Bad Slug", title: "" });
    let captured = "";
    const code = await runCli(
      ["feature", "--root", root, "--file", file],
      (s) => (captured += s),
    );
    expect(code).toBe(1);
    expect(captured).toContain("error");
  });

  it("중복 slug feature는 비0 종료코드로 거부한다", async () => {
    await runCli(["init", "--root", root]);
    const first = writeSpec("a.json", { slug: "dup", title: "A" });
    await runCli(["feature", "--root", root, "--file", first]);
    const second = writeSpec("b.json", { slug: "dup", group: "other", title: "B" });
    let captured = "";
    const code = await runCli(
      ["feature", "--root", root, "--file", second],
      (s) => (captured += s),
    );
    expect(code).toBe(1);
    expect(captured).toContain("Duplicate");
  });
});
