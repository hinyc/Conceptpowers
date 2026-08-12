// @concept:init-gate @concept:plugin-version-sync
import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffoldInit, isInitialized } from './init/scaffold.js';
import { syncIfStale, findPluginRoot } from './version/autoSync.js';
import { writeFeature } from './store/featureStore.js';
import { syncGenerated } from './init/syncGenerated.js';
import { VIEWER_SCRIPT_NAME, VIEWER_INDEX } from './init/packageScript.js';
import { buildInitHint } from './i18n/messages.js';
import type { Locale } from './schema/initConfig.js';
import { renderViewerToDisk } from './viewer/render.js';
import { buildMapping, writeMappingCache, updateMappingCache } from './mapping/scan.js';
import { auditIntegrity } from './audit/audit.js';
import { findConceptlessFiles } from './audit/gaps.js';
import { listTrackedFiles } from './audit/tracked.js';
import { readInitConfig } from './init/readConfig.js';
import { InitConfigSchema } from './schema/initConfig.js';
import { matchesAny } from './util/glob.js';
import { approveConcept } from './concept/approve.js';
import { computeDrift } from './drift/detect.js';
import { noteChange } from './drift/note.js';
import { setPendingConflict, clearPendingConflict } from './concept/pendingConflicts.js';
import { readConcept, editConceptContent } from './store/conceptStore.js';
import { checkConceptQuality } from './concept/quality.js';
import { recordAttest } from './concept/attest.js';
import { listReferenceFiles } from './init/reference.js';
import { checkReferencePaths } from './init/referencePaths.js';

type Out = (s: string) => void;

// render/approve/edit-concept가 공통으로 안내하는 뷰어 경로·서빙 명령.
// 하드코딩 대신 packageScript.ts의 상수를 그대로 재사용한다.
function viewerHint(): { viewer: string; serve: string } {
  return { viewer: VIEWER_INDEX, serve: `npm run ${VIEWER_SCRIPT_NAME}` };
}

export async function runCli(
  argv: string[],
  out: Out = (s) => process.stdout.write(s),
  err: Out = (s) => process.stderr.write(s)
): Promise<number> {
  const program = new Command();
  program.name('conceptpowers').exitOverride();
  let code = 0;

  // init 강제: 초기화 마커(init.json) 없이는 어떤 명령도 실행하지 않는다.
  // init(최초 진입)과 status(진단)만 예외. throw는 아래 catch가 {error} + exit 1로 변환한다.
  const NO_INIT_REQUIRED = new Set(['init', 'status']);
  program.hook('preAction', async (_thisCommand, actionCommand) => {
    if (NO_INIT_REQUIRED.has(actionCommand.name())) return;
    const root = (actionCommand.opts() as { root?: string }).root ?? process.cwd();
    if (!(await isInitialized(root))) {
      throw new Error(
        'not initialized — run /conceptpowers:init first (docs/conceptpowers/init.json missing)'
      );
    }
    // 플러그인 업데이트 후 version sync가 아직 안 됐으면 여기서 자동으로 맞추고 계속 진행한다.
    // version-sync 명령 자신은 제외(같은 패치 루틴을 스스로 실행) — alias `sync`도 name()은 정식 이름.
    // stdout은 각 명령의 JSON 전용이므로 안내는 stderr 한 줄. 어떤 실패도 명령을 막지 않는다.
    if (actionCommand.name() === 'version-sync') return;
    try {
      const pluginRoot =
        process.env.CLAUDE_PLUGIN_ROOT ?? findPluginRoot(dirname(fileURLToPath(import.meta.url)));
      if (!pluginRoot) return;
      const syncResult = await syncIfStale(root, pluginRoot);
      if (syncResult.synced) {
        err(
          `[conceptpowers] auto version-sync: generated artifacts patched to v${syncResult.installed}` +
            `${syncResult.generator ? ` (were v${syncResult.generator})` : ' (previously unstamped)'} — baseline untouched\n`
        );
      }
    } catch {
      // best-effort: 자동 sync 경로의 어떤 실패도 본 명령 실행을 막지 않는다
    }
  });

  program
    .command('init')
    .option('--root <dir>', 'project root', process.cwd())
    .option('--mode <mode>', 'incremental|strict', 'incremental')
    .option('--lang <lang>', 'ko|en', 'ko')
    .action(async (o) => {
      const result = await scaffoldInit(o.root, { backfillMode: o.mode, locale: o.lang });
      out(
        buildInitHint(o.lang as Locale, {
          viewerScriptAdded: result.viewerScriptAdded,
          viewerCommand: `npm run ${VIEWER_SCRIPT_NAME}`,
          viewerPath: VIEWER_INDEX,
        })
      );
    });

  program
    .command('version-sync')
    .alias('sync') // 구명령 호환 — 개념 동기화(map)와 혼동을 줄이기 위해 version-sync가 정식 이름
    .description(
      '플러그인 버전 동기화 — 생성물(뷰어 에셋·스크립트)을 설치 버전으로 패치 (baseline 불변)'
    )
    .option('--root <dir>', 'project root', process.cwd())
    .action(async (o) => {
      out(JSON.stringify({ ok: true, ...(await syncGenerated(o.root)) }));
    });

  program
    .command('status')
    .option('--root <dir>', 'project root', process.cwd())
    .action(async (o) => {
      out(
        JSON.stringify({
          initialized: await isInitialized(o.root),
          drift: (await computeDrift(o.root)).length,
        })
      );
    });

  program
    .command('render')
    .option('--root <dir>', 'project root', process.cwd())
    .action(async (o) => {
      await renderViewerToDisk(o.root);
      out(JSON.stringify({ ok: true, ...viewerHint() }));
    });

  program
    .command('approve')
    .option('--root <dir>', 'project root', process.cwd())
    .argument('<slug>')
    .action(async (slug, o) => {
      await approveConcept(o.root, slug);
      await renderViewerToDisk(o.root);
      out(JSON.stringify({ ok: true, slug, ...viewerHint() }));
    });

  program
    .command('edit-concept')
    .description(
      '개념 본문 수정 — 사용자 승인 후에만 실행한다. green 개념은 자동으로 pending으로 내려가며, ' +
        'approve로 사람이 다시 승인해야 개념으로 재활성화된다 (human-owns-contract·settled-status).'
    )
    .argument('<slug>')
    .requiredOption('--file <path>', '수정할 필드만 담은 패치 JSON 경로')
    .option('--reason <reason>', '변경 사유 (drift 이력에 기록)')
    .option('--root <dir>', 'project root', process.cwd())
    .action(async (slug, o) => {
      const before = await readConcept(o.root, slug);
      if (!before) {
        out(JSON.stringify({ error: `Concept not found: ${slug}` }));
        code = 1;
        return;
      }
      const wasGreen = before.status === 'green';
      const patch = JSON.parse(await readFile(o.file, 'utf8'));
      const concept = await editConceptContent(o.root, slug, patch);
      if (o.reason) await noteChange(o.root, slug, o.reason);
      await renderViewerToDisk(o.root);
      out(
        JSON.stringify({
          ok: true,
          slug,
          status: concept.status,
          downgradedToPending: wasGreen,
          ...viewerHint(),
        })
      );
    });

  program
    .command('feature')
    .description('feature 명세를 검증해 features/에 기록 (기능↔개념·기능↔코드 배선)')
    .requiredOption('--file <path>', 'feature JSON 파일 경로')
    .option('--root <dir>', 'project root', process.cwd())
    .action(async (o) => {
      const feature = await writeFeature(o.root, JSON.parse(await readFile(o.file, 'utf8')));
      out(JSON.stringify({ ok: true, slug: feature.slug, group: feature.group }));
    });

  program
    .command('map')
    .option('--root <dir>', 'project root', process.cwd())
    .option('--full', 'rebuild the cache from only the given files (discard existing entries)')
    .argument('<files...>')
    .action(async (files, o) => {
      if (o.full) await writeMappingCache(o.root, await buildMapping(o.root, files));
      else await updateMappingCache(o.root, files);
    });

  program
    .command('audit')
    .description('파일 지정: 태그 정합성 검사 / 인자 없음: 전체 스캔 + 개념 없는 코드(gap) 탐지')
    .option('--root <dir>', 'project root', process.cwd())
    .argument('[files...]')
    .action(async (files, o) => {
      if (files.length > 0) {
        const r = await auditIntegrity(o.root, files);
        out(JSON.stringify(r));
        if (!r.ok) code = 1;
        return;
      }
      // 전체 스캔: git 추적 파일 전체 + conceptless gap. ignoreGlobs 폴백은
      // preToolUse 게이트와 동일 규칙(스키마 기본값)을 쓴다.
      // 중요: 태그 정합성 검사(auditIntegrity)에도 ignoreGlobs를 적용한다 —
      // 플러그인 생성물(viewer/serve.mjs 등)에는 번들된 @concept 주석이 남아 있어,
      // 필터 없이 스캔하면 사용자 프로젝트에서 미존재 slug 오탐이 난다.
      const all = await listTrackedFiles(o.root);
      const cfg = await readInitConfig(o.root);
      const ignoreGlobs = cfg?.ignoreGlobs ?? InitConfigSchema.shape.ignoreGlobs.parse(undefined);
      const scanned = all.filter((rel) => !matchesAny(rel, ignoreGlobs));
      const r = await auditIntegrity(o.root, scanned);
      const conceptless = await findConceptlessFiles(o.root, scanned, ignoreGlobs);
      out(JSON.stringify({ ...r, conceptless }));
      if (!r.ok || conceptless.length > 0) code = 1;
    });

  program
    .command('drift')
    .option('--root <dir>', 'project root', process.cwd())
    .action(async (o) => {
      out(JSON.stringify(await computeDrift(o.root)));
    });

  program
    .command('note-change')
    .option('--root <dir>', 'project root', process.cwd())
    .requiredOption('--reason <reason>', 'why the concept changed')
    .argument('<slug>')
    .action(async (slug, o) => {
      await noteChange(o.root, slug, o.reason);
    });

  program
    .command('note-conflict')
    .argument('<slug>')
    .requiredOption('--reason <reason>', '충돌 사유')
    .option('--root <root>', '프로젝트 루트', process.cwd())
    .action(async (slug, o) => {
      await setPendingConflict(o.root, slug, o.reason);
    });

  program
    .command('resolve-conflict')
    .argument('<slug>')
    .option('--root <root>', '프로젝트 루트', process.cwd())
    .action(async (slug, o) => {
      await clearPendingConflict(o.root, slug);
    });

  program
    .command('quality')
    .description('개념의 결정론적 품질 최소치 검사 (green 승격 전제조건)')
    .argument('<slug>')
    .option('--root <dir>', 'project root', process.cwd())
    .action(async (slug, o) => {
      const concept = await readConcept(o.root, slug);
      if (!concept) {
        out(JSON.stringify({ error: `Concept not found: ${slug}` }));
        code = 1;
        return;
      }
      const r = checkConceptQuality(concept);
      out(JSON.stringify(r));
      if (!r.ok) code = 1;
    });

  program
    .command('reference')
    .description('참고자료 현황 — 폴더 파일 + paths.md 외부 경로 검증 (없음/빈 폴더 시 exit 1)')
    .option('--root <dir>', 'project root', process.cwd())
    .action(async (o) => {
      const files = await listReferenceFiles(o.root);
      const external = await checkReferencePaths(o.root);
      const ok = external.every((p) => p.status === 'ok');
      out(JSON.stringify({ ok, files, external }));
      if (!ok) code = 1;
    });

  program
    .command('attest-consistency')
    .description('check-consistency 실행 결과를 계약 해시에 묶어 기록 (증빙)')
    .argument('<slug>')
    .requiredOption('--result <result>', 'pass|conflict')
    .requiredOption('--compared <slugs>', '비교한 대상 개념 slug 목록 (쉼표 구분)')
    .option('--note <text>', '판단 요약')
    .option('--root <dir>', 'project root', process.cwd())
    .action(async (slug, o) => {
      if (o.result !== 'pass' && o.result !== 'conflict') {
        throw new Error(`--result must be pass|conflict, got: ${o.result}`);
      }
      const concept = await readConcept(o.root, slug);
      if (!concept) throw new Error(`Concept not found: ${slug}`);
      const compared = (o.compared as string)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (compared.length === 0) {
        throw new Error('--compared must list at least one concept slug');
      }
      const missing: string[] = [];
      for (const s of compared) {
        if (s !== slug && !(await readConcept(o.root, s))) missing.push(s);
      }
      if (missing.length > 0) {
        throw new Error(`--compared has unknown concept slug(s): ${missing.join(', ')}`);
      }
      const entry = await recordAttest(o.root, concept, o.result, {
        compared,
        note: o.note,
      });
      out(JSON.stringify({ ok: true, slug, ...entry }));
    });

  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (error) {
    out(JSON.stringify({ error: (error as Error).message }));
    return 1;
  }
  return code;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runCli(process.argv.slice(2)).then((c) => process.exit(c));
}
