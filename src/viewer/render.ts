// src/viewer/render.ts
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Concept } from '../schema/concept.js'
import type { Feature } from '../schema/feature.js'
import type { Locale } from '../schema/initConfig.js'
import { conceptPage, indexPage, featurePage, conceptRel, featureRel } from './template.js'
import { buildGraphData, graphPage, reverseFeatureIndex } from './graph.js'
import { listConcepts } from '../store/conceptStore.js'
import { listFeatures } from '../store/featureStore.js'
import { readInitConfig } from '../init/readConfig.js'
import { cpPaths } from '../paths.js'

export function renderViewer(
  concepts: Concept[],
  locale: Locale = 'ko',
  features: Feature[] = []
): Record<string, string> {
  const reverse = reverseFeatureIndex(features)
  const conceptBySlug = new Map(concepts.map((c) => [c.slug, c]))
  const out: Record<string, string> = {
    'index.html': indexPage(concepts, locale, features),
    'graph.html': graphPage(buildGraphData(concepts, features), locale)
  }
  for (const c of concepts) {
    out[conceptRel(c)] = conceptPage(c, locale, reverse.get(c.slug) ?? [])
  }
  for (const f of features) {
    out[featureRel(f)] = featurePage(f, locale, conceptBySlug)
  }
  return out
}

async function readBundledCss(): Promise<string> {
  // 번들 위치(dist/cli.js, dist/viewer/render.js, src/viewer/render.ts 등)에
  // 무관하게 assets/concept.css를 찾도록 상위 디렉터리를 탐색한다.
  const start = dirname(fileURLToPath(import.meta.url))
  let dir = start
  for (let i = 0; i < 6; i++) {
    try {
      return await readFile(join(dir, 'assets', 'concept.css'), 'utf8')
    } catch {
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  throw new Error(`concept.css not found (search start: ${start})`)
}

export async function renderViewerToDisk(root: string): Promise<void> {
  const concepts = await listConcepts(root)
  const features = await listFeatures(root)
  const locale = (await readInitConfig(root))?.locale ?? 'ko'
  const files = renderViewer(concepts, locale, features)
  const viewer = cpPaths(root).conceptsViewer
  for (const [rel, html] of Object.entries(files)) {
    const target = join(viewer, rel)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, html, 'utf8')
  }
  const cssTarget = cpPaths(root).cssTarget
  await mkdir(dirname(cssTarget), { recursive: true })
  await writeFile(cssTarget, await readBundledCss(), 'utf8')
}
