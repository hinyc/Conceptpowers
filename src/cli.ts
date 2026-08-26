// @concept:init-gate @concept:plugin-version-sync @concept:governance-mode
import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffoldInit, isInitialized } from './init/scaffold.js';
import { syncIfStale, checkStale, findPluginRoot } from './version/autoSync.js';
import { writeFeature } from './store/featureStore.js';
import { syncGenerated } from './init/syncGenerated.js';
import { VIEWER_SCRIPT_NAME, VIEWER_INDEX } from './init/packageScript.js';
import { buildInitHint } from './i18n/messages.js';
import type { Locale } from './schema/initConfig.js';
import { renderViewerToDisk } from './viewer/render.js';
import { buildMapping, writeMappingCache, updateMappingCache } from './mapping/scan.js';
import { auditIntegrity } from './audit/audit.js';
import { findConceptlessFiles, isCodeFile } from './audit/gaps.js';
import { listTrackedFiles } from './audit/tracked.js';
import { readInitConfig } from './init/readConfig.js';
import { defaultIgnoreGlobs } from './schema/initConfig.js';
import { matchesAny } from './util/glob.js';
import { approveConcept } from './concept/approve.js';
import { computeDrift } from './drift/detect.js';
import { noteChange } from './drift/note.js';
import { setPendingConflict, clearPendingConflict } from './concept/pendingConflicts.js';
import { readConcept, listConcepts, editConceptContent } from './store/conceptStore.js';
import { checkConceptQuality } from './concept/quality.js';
import { recordAttest } from './concept/attest.js';
import { recordTestReview } from './concept/testReview.js';
import { listReferenceFiles } from './init/reference.js';
import { checkReferencePaths } from './init/referencePaths.js';
import { addReferencePath } from './init/addReferencePath.js';

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
    .option('--enforcement <level>', 'strict|standard|light (커밋 게이트 강도)', 'standard')
    .action(async (o) => {
      const result = await scaffoldInit(o.root, {
        backfillMode: o.mode,
        locale: o.lang,
        enforcement: o.enforcement,
      });
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
    .option('--force', '버전이 같아도 생성물을 다시 만든다')
    .action(async (o) => {
      // 개념 plugin-version-sync: "버전이 같으면 아무것도 하지 않는다".
      // 명시 실행도 예외가 아니다 — 같은 버전에서 재생성하면 산출물의 원본(assets/)이
      // 설치본보다 앞선 환경에서 앞선 내용을 통째로 되돌려 버린다.
      const pluginRoot =
        process.env.CLAUDE_PLUGIN_ROOT ?? findPluginRoot(dirname(fileURLToPath(import.meta.url)));
      const state = pluginRoot
        ? await checkStale(o.root, pluginRoot)
        : { installed: null, generator: null, stale: true };
      if (!o.force && !state.stale) {
        out(
          JSON.stringify({
            ok: true,
            skipped: true,
            reason: 'up-to-date',
            installed: state.installed,
            generator: state.generator,
          })
        );
        return;
      }
      const result = await syncGenerated(o.root, { stampVersion: state.installed ?? undefined });
      out(JSON.stringify({ ok: true, installed: state.installed, ...result }));
    });

  program
    .command('status')
    .option('--root <dir>', 'project root', process.cwd())
    .action(async (o) => {
      out(
        JSON.stringify({
          initialized: await isInitialized(o.root),
          drift: (await computeDrift(o.root)).length,
          enforcement: (await readInitConfig(o.root))?.enforcement ?? 'standard',
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
      // ignoreGlobs 폴백은 다른 전체 스캔 명령과 동일 규칙(스키마 기본값) —
      // 플러그인 생성물(docs/conceptpowers/** 등)이 개념→코드 매핑에 섞이지 않게 한다.
      const cfg = await readInitConfig(o.root);
      const ignoreGlobs = cfg?.ignoreGlobs ?? defaultIgnoreGlobs();
      if (o.full) await writeMappingCache(o.root, await buildMapping(o.root, files, ignoreGlobs));
      else await updateMappingCache(o.root, files, ignoreGlobs);
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
      const ignoreGlobs = cfg?.ignoreGlobs ?? defaultIgnoreGlobs();
      const scanned = all.filter((rel) => !matchesAny(rel, ignoreGlobs));
      // 태그 정합성(unknownTags) 스캔은 코드 파일로 한정한다 — .md 문서의 예시
      // 텍스트나 비코드 파일에 우연히 등장하는 @concept: 리터럴은 태그가 아니다.
      const codeScanned = scanned.filter(isCodeFile);
      const r = await auditIntegrity(o.root, codeScanned);
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
    .description('개념의 결정론적 품질 최소치 검사 (green 승격 전제조건). slug를 빼면 전 개념 검사')
    .argument('[slug]')
    .option('--root <dir>', 'project root', process.cwd())
    .action(async (slug, o) => {
      // slug 없이 부르면 전수 검사 — 경고(코드 표기)는 종료 코드를 바꾸지 않는다.
      if (!slug) {
        const concepts = await listConcepts(o.root);
        const reports = concepts.map((c) => ({ slug: c.slug, ...checkConceptQuality(c) }));
        const failed = reports.filter((r) => !r.ok).length;
        const warned = reports.filter((r) => r.warnings.length > 0).length;
        out(JSON.stringify({ total: reports.length, failed, warned, reports }));
        if (failed > 0) code = 1;
        return;
      }
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

  // 등록 결과와 전체 현황을 함께 돌려준다 — 스킬이 한 번의 호출로 "추가됨 + 자료 없는 경로 경고"를
  // 모두 보고할 수 있게 하기 위해서다. missing/empty는 실패가 아니라 경고이므로 exit 0을 유지한다.
  program
    .command('reference-add')
    .description('참고자료 경로 등록 — paths.md에 폴더/파일 경로를 추가하고 전체 현황을 반환')
    .argument('<paths...>', '등록할 폴더 또는 파일 경로 (여러 개 가능)')
    .option('--root <dir>', 'project root', process.cwd())
    .action(async (paths: string[], o) => {
      const { added, skipped } = await addReferencePath(o.root, paths);
      out(
        JSON.stringify({
          ok: true,
          added,
          skipped,
          files: await listReferenceFiles(o.root),
          external: await checkReferencePaths(o.root),
        })
      );
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

  program
    .command('attest-test-review')
    .description('개념 변경에 딸린 검사를 어떻게 처리했는지 계약 해시에 묶어 기록 (검토 기록)')
    .argument('<slug>')
    .requiredOption('--result <result>', 'updated|no-impact|no-tests')
    .option('--tests <paths>', '검토·수정한 검사 파일 경로 목록 (쉼표 구분)')
    .option('--note <text>', '판단 요약 (no-impact·no-tests는 사유를 반드시 적는다)')
    .option('--root <dir>', 'project root', process.cwd())
    .action(async (slug, o) => {
      const results = ['updated', 'no-impact', 'no-tests'];
      if (!results.includes(o.result)) {
        throw new Error(`--result must be ${results.join('|')}, got: ${o.result}`);
      }
      const concept = await readConcept(o.root, slug);
      if (!concept) throw new Error(`Concept not found: ${slug}`);
      const tests = ((o.tests as string) ?? '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
      if (o.result === 'updated' && tests.length === 0) {
        throw new Error('--tests must list at least one test file when --result updated');
      }
      // 검사를 고치지 않기로 한 판단은 근거 없이 남길 수 없다 — 기록의 목적이 사유 보존이다.
      if (o.result !== 'updated' && !o.note) {
        throw new Error(`--note is required when --result ${o.result}`);
      }
      const entry = await recordTestReview(o.root, concept, o.result, { tests, note: o.note });
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
