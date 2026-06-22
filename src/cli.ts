import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { scaffoldInit, isInitialized } from "./init/scaffold.js";
import { writeFeature } from "./store/featureStore.js";
import { syncGenerated } from "./init/syncGenerated.js";
import { VIEWER_SCRIPT_NAME, VIEWER_INDEX } from "./init/packageScript.js";
import { buildInitHint } from "./i18n/messages.js";
import type { Locale } from "./schema/initConfig.js";
import { renderViewerToDisk } from "./viewer/render.js";
import { buildMapping, writeMappingCache } from "./mapping/scan.js";
import { auditIntegrity } from "./audit/audit.js";
import { approveConcept } from "./concept/approve.js";
import { computeDrift } from "./drift/detect.js";
import { noteChange } from "./drift/note.js";
import { setPendingConflict, clearPendingConflict } from "./concept/pendingConflicts.js";

type Out = (s: string) => void;

export async function runCli(
  argv: string[],
  out: Out = (s) => process.stdout.write(s),
): Promise<number> {
  const program = new Command();
  program.name("conceptpowers").exitOverride();
  let code = 0;

  program
    .command("init")
    .option("--root <dir>", "project root", process.cwd())
    .option("--mode <mode>", "incremental|strict", "incremental")
    .option("--lang <lang>", "ko|en", "ko")
    .action(async (o) => {
      const result = await scaffoldInit(o.root, { backfillMode: o.mode, locale: o.lang });
      out(buildInitHint(o.lang as Locale, {
        viewerScriptAdded: result.viewerScriptAdded,
        viewerCommand: `npm run ${VIEWER_SCRIPT_NAME}`,
        viewerPath: VIEWER_INDEX,
      }));
    });

  program
    .command("sync")
    .description("플러그인 생성물(뷰어 에셋·스크립트)을 최신으로 패치 (baseline 불변)")
    .option("--root <dir>", "project root", process.cwd())
    .action(async (o) => {
      if (!(await isInitialized(o.root))) {
        out(JSON.stringify({ error: "not initialized" }));
        code = 1;
        return;
      }
      out(JSON.stringify({ ok: true, ...(await syncGenerated(o.root)) }));
    });

  program
    .command("status")
    .option("--root <dir>", "project root", process.cwd())
    .action(async (o) => {
      out(JSON.stringify({
        initialized: await isInitialized(o.root),
        drift: (await computeDrift(o.root)).length,
      }));
    });

  program
    .command("render")
    .option("--root <dir>", "project root", process.cwd())
    .action(async (o) => {
      await renderViewerToDisk(o.root);
    });

  program
    .command("approve")
    .option("--root <dir>", "project root", process.cwd())
    .argument("<slug>")
    .action(async (slug, o) => {
      await approveConcept(o.root, slug);
      await renderViewerToDisk(o.root);
    });

  program
    .command("feature")
    .description("feature 명세를 검증해 features/에 기록 (기능↔개념·기능↔코드 배선)")
    .requiredOption("--file <path>", "feature JSON 파일 경로")
    .option("--root <dir>", "project root", process.cwd())
    .action(async (o) => {
      const feature = await writeFeature(o.root, JSON.parse(await readFile(o.file, "utf8")));
      out(JSON.stringify({ ok: true, slug: feature.slug, group: feature.group }));
    });

  program
    .command("map")
    .option("--root <dir>", "project root", process.cwd())
    .argument("<files...>")
    .action(async (files, o) => {
      await writeMappingCache(o.root, await buildMapping(o.root, files));
    });

  program
    .command("audit")
    .option("--root <dir>", "project root", process.cwd())
    .argument("<files...>")
    .action(async (files, o) => {
      const r = await auditIntegrity(o.root, files);
      out(JSON.stringify(r));
      if (!r.ok) code = 1;
    });

  program
    .command("drift")
    .option("--root <dir>", "project root", process.cwd())
    .action(async (o) => {
      out(JSON.stringify(await computeDrift(o.root)));
    });

  program
    .command("note-change")
    .option("--root <dir>", "project root", process.cwd())
    .requiredOption("--reason <reason>", "why the concept changed")
    .argument("<slug>")
    .action(async (slug, o) => {
      await noteChange(o.root, slug, o.reason);
    });

  program
    .command("note-conflict")
    .argument("<slug>")
    .requiredOption("--reason <reason>", "충돌 사유")
    .option("--root <root>", "프로젝트 루트", process.cwd())
    .action(async (slug, o) => {
      await setPendingConflict(o.root, slug, o.reason);
    });

  program
    .command("resolve-conflict")
    .argument("<slug>")
    .option("--root <root>", "프로젝트 루트", process.cwd())
    .action(async (slug, o) => {
      await clearPendingConflict(o.root, slug);
    });

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (error) {
    out(JSON.stringify({ error: (error as Error).message }));
    return 1;
  }
  return code;
}

const isMain =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runCli(process.argv.slice(2)).then((c) => process.exit(c));
}
