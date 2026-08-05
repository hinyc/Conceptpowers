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

// 설치 버전이 산출물 도장보다 새것(또는 도장 없음)일 때만 syncGenerated를 실행한다.
// 판단에 쓴 설치 버전을 재도장 값으로 그대로 넘겨, 한 번의 sync로 반드시 수렴하게 한다.
// baseline은 건드리지 않으며, 다운그레이드(구버전이 신버전 산출물 덮어쓰기)는 하지 않는다.
export async function syncIfStale(root: string, pluginRoot: string): Promise<AutoSyncResult> {
  try {
    const installed = await readInstalledVersion(pluginRoot);
    if (!installed) return { synced: false, installed: null, generator: null };
    const generator = await readGeneratorVersion(root);
    if (generator && !isNewer(installed, generator)) return { synced: false, installed, generator };
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
