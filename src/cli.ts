import { Command } from "commander";
import { scaffoldInit, isInitialized } from "./init/scaffold.js";
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
      await scaffoldInit(o.root, { backfillMode: o.mode, locale: o.lang });
      if (o.mode === "strict") await renderViewerToDisk(o.root);
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
