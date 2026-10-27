// @concept:plugin-version-sync
// src/init/syncGenerated.ts
// 플러그인이 "생성하는" 산출물만 최신 상태로 패치한다(baseline은 절대 건드리지 않음).
// 버전업 후 기존 프로젝트가 옛 뷰어/스크립트에 묶이는 문제를 해소한다.
// 호출처: init 재실행(멱등 패치) + 전용 `sync` 명령/스킬.
import { readdir, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { renderViewerToDisk } from '../viewer/render.js';
import { upsertViewerScript, type ViewerScriptStatus } from './packageScript.js';
import { ensureReference } from './reference.js';
import { ensureReferencePaths } from './referencePaths.js';
import { ensureAlignmentGitignore } from './alignmentGitignore.js';
import { ensureReferenceGitignore } from './referenceGitignore.js';
import { ensureInitConfigDefaults } from './ensureConfigDefaults.js';
import type { ReferenceLockMode, ReferenceLockIgnoreStatus } from './referenceLockIgnore.js';
import { syncReferenceLockIgnore } from '../reference/lock.js';
import { cpPaths } from '../paths.js';

export type SyncStep =
  | 'referenceGitignore'
  | 'reference'
  | 'referencePaths'
  | 'alignmentGitignore'
  | 'configDefaults'
  | 'referenceLockIgnore'
  | 'legacyViewerCleanup'
  | 'packageScript'
  | 'viewer';

export interface SyncStepFailure {
  step: SyncStep;
  error: string;
}

export interface SyncResult {
  scriptStatus: ViewerScriptStatus;
  orphansRemoved: number;
  referenceReadmeCreated: boolean;
  referencePathsCreated: boolean;
  alignmentGitignoreCreated: boolean;
  referenceGitignoreCreated: boolean;
  // 새 버전에서 생겨 이번에 기본값으로 채운 설정 항목 이름들.
  configFieldsAdded: string[];
  // 참고자료 기준점의 공유 설정과, 그에 맞춰 .alignment/.gitignore를 손본 결과.
  // 설정을 읽지 못하면 null이고 .gitignore는 건드리지 않는다(unchanged).
  referenceLockMode: ReferenceLockMode | null;
  referenceLockIgnore: ReferenceLockIgnoreStatus;
  // 실패한 단계들. 비어 있지 않으면 버전 도장을 새로 찍지 않아 다음 동기화가 다시 시도한다.
  failedSteps: SyncStepFailure[];
}

// 옛 포맷의 개념별 *.html / graph.html 고아 파일을 정리한다.
// 새 단일 SPA의 index.html(뷰어 루트)만 남기고, 비워진 디렉터리는 잘라낸다.
async function cleanLegacyViewerHtml(viewerDir: string): Promise<number> {
  const keep = join(viewerDir, 'index.html');
  let removed = 0;
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
        // 비워진 옛 그룹/features 디렉터리 정리(assets는 viewer.js/css가 있어 안 비워짐).
        try {
          if ((await readdir(full)).length === 0) await rmdir(full);
        } catch {
          /* 동시성/권한 문제는 무시 */
        }
      } else if (e.name.endsWith('.html') && full !== keep) {
        await rm(full);
        removed++;
      }
    }
  }
  await walk(viewerDir);
  return removed;
}

export interface SyncOpts {
  // manifest에 찍을 생성 버전. 자동 sync가 "판단에 쓴 설치 버전"을 넘겨 수렴을 보장한다.
  // 생략하면 render가 자기 모듈 위치에서 plugin.json을 찾아 도장 찍는다.
  stampVersion?: string;
}

interface StepOutcome<T> {
  value: T;
  failure?: SyncStepFailure;
}

// 한 단계를 따로 실행한다. 실패해도 던지지 않고 기본값과 실패 사유를 돌려줘 뒤 단계를 막지 않는다.
async function runStep<T>(
  step: SyncStep,
  fn: () => Promise<T>,
  fallback: T
): Promise<StepOutcome<T>> {
  try {
    return { value: await fn() };
  } catch (error) {
    return { value: fallback, failure: { step, error: (error as Error).message } };
  }
}

const VIEWER_SKIPPED =
  'skipped: earlier steps failed — viewer and version stamp left as-is so the next sync retries';

// 뷰어 앞의 단계들. 참고자료 추적 제외(reference/.gitignore)를 가장 먼저 보장한다.
async function runPreparationSteps(root: string) {
  const refIgnore = await runStep(
    'referenceGitignore',
    () => ensureReferenceGitignore(root),
    false
  );
  const readme = await runStep('reference', () => ensureReference(root), false);
  const paths = await runStep('referencePaths', () => ensureReferencePaths(root), false);
  const alignIgnore = await runStep(
    'alignmentGitignore',
    () => ensureAlignmentGitignore(root),
    false
  );
  const noFields: string[] = [];
  const config = await runStep('configDefaults', () => ensureInitConfigDefaults(root), noFields);
  const lockIgnore = await runStep('referenceLockIgnore', () => syncReferenceLockIgnore(root), {
    mode: null,
    status: 'unchanged',
  } as const);
  const viewerDir = cpPaths(root).conceptsViewer;
  const orphans = await runStep('legacyViewerCleanup', () => cleanLegacyViewerHtml(viewerDir), 0);
  const noPackage: ViewerScriptStatus = 'no-package';
  const script = await runStep('packageScript', () => upsertViewerScript(root), noPackage);
  return { refIgnore, readme, paths, alignIgnore, config, lockIgnore, orphans, script };
}

// 뷰어(버전 도장 포함)는 앞 단계가 모두 성공했을 때만 마지막에 쓴다 — 실패가 있으면 도장을
// 그대로 둬 다음 동기화가 다시 시도하게 한다.
export async function syncGenerated(root: string, opts: SyncOpts = {}): Promise<SyncResult> {
  const steps = await runPreparationSteps(root);
  const earlier = Object.values(steps).flatMap((o) => (o.failure ? [o.failure] : []));
  const viewer: StepOutcome<void> =
    earlier.length > 0
      ? { value: undefined, failure: { step: 'viewer', error: VIEWER_SKIPPED } }
      : await runStep('viewer', () => renderViewerToDisk(root, opts.stampVersion), undefined);
  return {
    scriptStatus: steps.script.value,
    orphansRemoved: steps.orphans.value,
    referenceReadmeCreated: steps.readme.value,
    referencePathsCreated: steps.paths.value,
    alignmentGitignoreCreated: steps.alignIgnore.value,
    referenceGitignoreCreated: steps.refIgnore.value,
    configFieldsAdded: steps.config.value,
    referenceLockMode: steps.lockIgnore.value.mode,
    referenceLockIgnore: steps.lockIgnore.value.status,
    failedSteps: viewer.failure ? [...earlier, viewer.failure] : earlier,
  };
}
