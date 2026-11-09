// @concept:generated-not-hand-edited
// src/viewer/render.ts
// 뷰어를 디스크에 만든다. 개념마다 HTML을 굽지 않고, 데이터는 원본 JSON으로 두고
// 단일 SPA(index.html + viewer.js)가 manifest.json을 통해 data/*.json을 fetch해 렌더한다.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from './manifest.js';
import { listConcepts } from '../store/conceptStore.js';
import { listFeatures } from '../store/featureStore.js';
import { readMappingCache } from '../mapping/scan.js';
import { readInitConfig } from '../init/readConfig.js';
import { localeOf } from '../schema/initConfig.js';
import { findPluginRoot, readInstalledVersion } from '../version/checkUpdate.js';
import { cpPaths } from '../paths.js';

// 번들 위치(dist/…, src/…)에 무관하게 상위 디렉터리를 탐색해 assets/<name>을 읽는다.
async function readAsset(name: string): Promise<Buffer> {
  const start = dirname(fileURLToPath(import.meta.url));
  let dir = start;
  for (let i = 0; i < 6; i++) {
    try {
      return await readFile(join(dir, 'assets', name));
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error(`asset not found: ${name} (search start: ${start})`);
}

async function copyAsset(name: string, target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, await readAsset(name));
}

// 플러그인 자신의 버전(.claude-plugin/plugin.json)을 상위 탐색으로 읽는다. 실패 시 null.
// manifest에 "이 산출물을 만든 버전"을 도장 찍어, 자동 sync(세션 시작·CLI 진입)가 비교에 쓴다.
async function readPluginVersion(): Promise<string | null> {
  const pluginRoot = findPluginRoot(dirname(fileURLToPath(import.meta.url)));
  return pluginRoot ? readInstalledVersion(pluginRoot) : null;
}

// 매니페스트(manifest.json)만 다시 쓴다. 정적 에셋 복사는 하지 않으므로
// 실행 중인 뷰어 서버(serve.mjs)가 자신·에셋을 덮어쓰는 일 없이 데이터 변경을 반영할 수 있다.
// stampVersion: 자동 sync가 "판단에 쓴 설치 버전"을 넘겨 도장과 비교 기준을 일치시킨다(수렴 보장).
// 생략하면 플러그인 자신의 버전, null이면 도장 없이(generatorVersion: null) 쓴다.
export async function writeManifest(root: string, stampVersion?: string | null): Promise<void> {
  const concepts = await listConcepts(root);
  const features = await listFeatures(root);
  const mapping = await readMappingCache(root);
  const locale = localeOf(await readInitConfig(root));
  const p = cpPaths(root);

  await mkdir(p.conceptsViewer, { recursive: true });
  const manifest = {
    ...buildManifest(concepts, features, locale, mapping),
    generatorVersion: stampVersion === undefined ? await readPluginVersion() : stampVersion,
  };
  await writeFile(
    join(p.conceptsViewer, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8'
  );
}

// 이미 있는 manifest의 버전 도장. 없거나 읽을 수 없으면 null.
async function readExistingStamp(root: string): Promise<string | null> {
  try {
    const raw = await readFile(join(cpPaths(root).conceptsViewer, 'manifest.json'), 'utf8');
    const stamp = (JSON.parse(raw) as { generatorVersion?: unknown }).generatorVersion;
    return typeof stamp === 'string' && stamp !== '' ? stamp : null;
  } catch {
    return null;
  }
}

// 데이터만 바뀐 경우(뷰어 편집)의 manifest 갱신. 에셋은 다시 만들지 않았으므로 기존 버전 도장을 그대로
// 둔다 — 도장을 지우거나 바꾸면 자동 동기화가 같은 버전인데도 다시 만들거나 옛 버전으로 되돌린다.
// 도장이 아직 없으면 비워 둔다(null) — 도장은 동기화(syncGenerated)만 찍는다. 비어 있으면 다음 동기화가 맞춘다.
export async function refreshManifestData(root: string): Promise<void> {
  await writeManifest(root, await readExistingStamp(root));
}

// 버전 도장(manifest)은 에셋을 모두 쓴 뒤 마지막에 찍는다 — 도중에 실패하면 옛 도장이 남아
// 자동 동기화가 다음에 다시 시도한다(plugin-version-sync). 먼저 찍으면 실패해도 최신으로 보인다.
// stamp: 새 도장을 찍을지. 생략하면 stampVersion을 넘긴 경우에만 찍는다. 찍을 때 stampVersion이 없으면
// 플러그인 자신의 버전을 쓴다. 찍지 않으면 기존 도장을 그대로 둔다(없으면 비움) — 도장은 "동기화로 맞췄다"는
// 표시라 동기화가 아닌 다시 그리기(render·approve·edit-concept)나 실패로 보류된 동기화는 도장을 바꾸지 않는다.
export interface RenderViewerOpts {
  stamp?: boolean;
}

export async function renderViewerToDisk(
  root: string,
  stampVersion?: string,
  opts: RenderViewerOpts = {}
): Promise<void> {
  const p = cpPaths(root);
  const shouldStamp = opts.stamp ?? stampVersion !== undefined;
  const stamp = shouldStamp ? stampVersion : await readExistingStamp(root);

  // 정적 셸/렌더러/서버/스타일을 복사한다(데이터와 분리된 자족 에셋).
  await copyAsset('index.html', join(p.conceptsViewer, 'index.html'));
  await copyAsset('viewer.js', join(p.conceptsViewer, 'assets', 'viewer.js'));
  await copyAsset('sidebar.js', join(p.conceptsViewer, 'assets', 'sidebar.js'));
  await copyAsset('topnav.js', join(p.conceptsViewer, 'assets', 'topnav.js'));
  await copyAsset('serve.mjs', join(p.conceptsViewer, 'serve.mjs'));
  await copyAsset('concept.css', p.cssTarget);
  await writeManifest(root, stamp);
}
