// src/viewer/render.ts
// 뷰어를 디스크에 만든다. 개념마다 HTML을 굽지 않고, 데이터는 원본 JSON으로 두고
// 단일 SPA(index.html + viewer.js)가 manifest.json을 통해 data/*.json을 fetch해 렌더한다.
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildManifest } from './manifest.js'
import { listConcepts } from '../store/conceptStore.js'
import { listFeatures } from '../store/featureStore.js'
import { readMappingCache } from '../mapping/scan.js'
import { readInitConfig } from '../init/readConfig.js'
import { cpPaths } from '../paths.js'

// 번들 위치(dist/…, src/…)에 무관하게 상위 디렉터리를 탐색해 assets/<name>을 읽는다.
async function readAsset(name: string): Promise<Buffer> {
  const start = dirname(fileURLToPath(import.meta.url))
  let dir = start
  for (let i = 0; i < 6; i++) {
    try {
      return await readFile(join(dir, 'assets', name))
    } catch {
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  throw new Error(`asset not found: ${name} (search start: ${start})`)
}

async function copyAsset(name: string, target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, await readAsset(name))
}

// 매니페스트(manifest.json)만 다시 쓴다. 정적 에셋 복사는 하지 않으므로
// 실행 중인 뷰어 서버(serve.mjs)가 자신·에셋을 덮어쓰는 일 없이 데이터 변경을 반영할 수 있다.
export async function writeManifest(root: string): Promise<void> {
  const concepts = await listConcepts(root)
  const features = await listFeatures(root)
  const mapping = await readMappingCache(root)
  const locale = (await readInitConfig(root))?.locale ?? 'ko'
  const p = cpPaths(root)

  await mkdir(p.conceptsViewer, { recursive: true })
  await writeFile(
    join(p.conceptsViewer, 'manifest.json'),
    JSON.stringify(buildManifest(concepts, features, locale, mapping), null, 2) + '\n',
    'utf8'
  )
}

export async function renderViewerToDisk(root: string): Promise<void> {
  await writeManifest(root)
  const p = cpPaths(root)

  // 정적 셸/렌더러/서버/스타일을 복사한다(데이터와 분리된 자족 에셋).
  await copyAsset('index.html', join(p.conceptsViewer, 'index.html'))
  await copyAsset('viewer.js', join(p.conceptsViewer, 'assets', 'viewer.js'))
  await copyAsset('serve.mjs', join(p.conceptsViewer, 'serve.mjs'))
  await copyAsset('concept.css', p.cssTarget)
}
