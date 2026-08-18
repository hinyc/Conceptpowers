// @concept:plugin-version-sync
// src/version/autoSync.ts
// "설치된 플러그인 버전 > 산출물에 찍힌 생성 버전"일 때만 생성물을 자동 sync하는 공용 판단기.
// 세션 시작 훅과 CLI preAction(모든 명령 진입점)이 같은 규칙을 공유한다.
// 버전이 같으면 아무것도 하지 않고, 어떤 실패도 다음 단계를 막지 않는다(best-effort).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { syncGenerated } from '../init/syncGenerated.js';
import { cpPaths } from '../paths.js';
import { isNewer } from './compareSemver.js';
import { readInstalledVersion, findPluginRoot } from './checkUpdate.js';

export { findPluginRoot };

export interface AutoSyncResult {
  synced: boolean;
  installed: string | null;
  generator: string | null;
}

// 뷰어 manifest에 찍힌 "이 산출물을 만든 버전" 도장. 없거나 못 읽으면 null.
async function readGeneratorVersion(root: string): Promise<string | null> {
  try {
    const manifest = JSON.parse(
      await readFile(join(cpPaths(root).conceptsViewer, 'manifest.json'), 'utf8')
    );
    return typeof manifest?.generatorVersion === 'string' ? manifest.generatorVersion : null;
  } catch {
    return null;
  }
}

export interface StaleCheck {
  installed: string | null;
  generator: string | null;
  // 재생성이 필요한가. 설치 버전을 못 읽거나 도장이 없으면 "같다"고 단정할 수 없어 true다.
  stale: boolean;
}

// 부수효과 없이 버전만 비교한다. 자동 sync(syncIfStale)와 명시 실행(version-sync 명령)이
// 같은 판단을 공유해, 어느 경로로도 "버전이 같은데 재생성"이 일어나지 않게 한다.
export async function checkStale(root: string, pluginRoot: string): Promise<StaleCheck> {
  const installed = await readInstalledVersion(pluginRoot);
  const generator = await readGeneratorVersion(root);
  if (!installed || !generator) return { installed, generator, stale: true };
  return { installed, generator, stale: isNewer(installed, generator) };
}

// 설치 버전이 산출물 도장보다 새것(또는 도장 없음)일 때만 syncGenerated를 실행한다.
// 판단에 쓴 설치 버전을 재도장 값으로 그대로 넘겨, 한 번의 sync로 반드시 수렴하게 한다.
// baseline은 건드리지 않으며, 다운그레이드(구버전이 신버전 산출물 덮어쓰기)는 하지 않는다.
export async function syncIfStale(root: string, pluginRoot: string): Promise<AutoSyncResult> {
  try {
    const { installed, generator, stale } = await checkStale(root, pluginRoot);
    // 자동 경로는 설치 버전을 못 읽으면 아무것도 하지 않는다(도장 값을 알 수 없어 수렴 불가).
    if (!installed) return { synced: false, installed: null, generator: null };
    if (!stale) return { synced: false, installed, generator };
    await syncGenerated(root, { stampVersion: installed });
    return { synced: true, installed, generator };
  } catch (error) {
    if (process.env.CONCEPTPOWERS_DEBUG) {
      process.stderr.write(
        `[conceptpowers] auto version-sync failed: ${(error as Error).message}\n`
      );
    }
    return { synced: false, installed: null, generator: null };
  }
}
