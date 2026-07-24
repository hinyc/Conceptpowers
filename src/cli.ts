import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { scaffoldInit, isInitialized } from './init/scaffold.js';
import { writeFeature } from './store/featureStore.js';
import { syncGenerated } from './init/syncGenerated.js';
import { VIEWER_SCRIPT_NAME, VIEWER_INDEX } from './init/packageScript.js';
import { buildInitHint } from './i18n/messages.js';
import type { Locale } from './schema/initConfig.js';
import { renderViewerToDisk } from './viewer/render.js';
import { buildMapping, writeMappingCache } from './mapping/scan.js';
import { auditIntegrity } from './audit/audit.js';
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

export async function runCli(
  argv: string[],
  out: Out = (s) => process.stdout.write(s)
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
    });

  program
    .command('approve')
    .option('--root <dir>', 'project root', process.cwd())
    .argument('<slug>')
    .action(async (slug, o) => {
      await approveConcept(o.root, slug);
      await renderViewerToDisk(o.root);
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
    .argument('<files...>')
    .action(async (files, o) => {
      await writeMappingCache(o.root, await buildMapping(o.root, files));
    });

  program
    .command('audit')
    .option('--root <dir>', 'project root', process.cwd())
    .argument('<files...>')
    .action(async (files, o) => {
      const r = await auditIntegrity(o.root, files);
      out(JSON.stringify(r));
      if (!r.ok) code = 1;
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
    .option('--root <dir>', 'project root', process.cwd())
    .action(async (slug, o) => {
      if (o.result !== 'pass' && o.result !== 'conflict') {
        throw new Error(`--result must be pass|conflict, got: ${o.result}`);
      }
      const concept = await readConcept(o.root, slug);
      if (!concept) throw new Error(`Concept not found: ${slug}`);
      const entry = await recordAttest(o.root, concept, o.result);
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
