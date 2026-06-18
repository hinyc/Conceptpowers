import { Command } from "commander";
import { scaffoldInit, isInitialized } from "./init/scaffold.js";
import { renderViewerToDisk } from "./viewer/render.js";
import { buildMapping, writeMappingCache } from "./mapping/scan.js";
import { auditIntegrity } from "./audit/audit.js";
export async function runCli(argv, out = (s) => process.stdout.write(s)) {
    const program = new Command();
    program.name("conceptpowers").exitOverride();
    let code = 0;
    program
        .command("init")
        .option("--root <dir>", "project root", process.cwd())
        .option("--mode <mode>", "incremental|strict", "incremental")
        .action(async (o) => {
        await scaffoldInit(o.root, { backfillMode: o.mode });
        if (o.mode === "strict")
            await renderViewerToDisk(o.root);
    });
    program
        .command("status")
        .option("--root <dir>", "project root", process.cwd())
        .action(async (o) => {
        out(JSON.stringify({ initialized: await isInitialized(o.root) }));
    });
    program
        .command("render")
        .option("--root <dir>", "project root", process.cwd())
        .action(async (o) => {
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
        if (!r.ok)
            code = 1;
    });
    try {
        await program.parseAsync(argv, { from: "user" });
    }
    catch (error) {
        out(JSON.stringify({ error: error.message }));
        return 1;
    }
    return code;
}
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
    runCli(process.argv.slice(2)).then((c) => process.exit(c));
}
//# sourceMappingURL=cli.js.map