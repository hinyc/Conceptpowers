// src/viewer/render.ts
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Concept } from '../schema/concept.js'
import type { Locale } from '../schema/initConfig.js'
import { conceptPage, indexPage } from './template.js'
import { listConcepts } from '../store/conceptStore.js'
import { readInitConfig } from '../init/readConfig.js'
import { cpPaths } from '../paths.js'

export function renderViewer(concepts: Concept[], locale: Locale = 'ko'): Record<string, string> {
  const out: Record<string, string> = { 'index.html': indexPage(concepts, locale) }
  for (const c of concepts) {
    const rel = c.group ? `${c.group}/${c.slug}.html` : `${c.slug}.html`
    out[rel] = conceptPage(c, locale)
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
  const locale = (await readInitConfig(root))?.locale ?? 'ko'
  const files = renderViewer(concepts, locale)
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
