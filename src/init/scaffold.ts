// src/init/scaffold.ts
import { mkdir, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { cpPaths } from '../paths.js'
import { parseInitConfig, type Locale, type ApprovalMode } from '../schema/initConfig.js'
import { seedTemplates } from '../i18n/messages.js'
import { renderViewerToDisk } from '../viewer/render.js'
import { addViewerScript } from './packageScript.js'

export interface ScaffoldOptions { backfillMode?: 'incremental' | 'strict'; name?: string; description?: string; locale?: Locale; approvalMode?: ApprovalMode }

export async function isInitialized(root: string): Promise<boolean> {
  try { await access(cpPaths(root).initFile); return true } catch { return false }
}

export async function scaffoldInit(root: string, opts: ScaffoldOptions): Promise<void> {
  const p = cpPaths(root)
  for (const d of [p.features, p.conceptsData, p.conceptsViewer, p.architecture, p.infra])
    await mkdir(d, { recursive: true })

  if (await isInitialized(root)) return // 보존: 사용자 전속(규칙4)

  const locale: Locale = opts.locale ?? 'ko'
  const config = parseInitConfig({
    version: '0.1.0', enabled: true,
    backfillMode: opts.backfillMode ?? 'incremental',
    locale,
    approvalMode: opts.approvalMode ?? 'manual',
    project: { name: opts.name ?? '', description: opts.description ?? '' }
  })
  await writeFile(p.initFile, JSON.stringify(config, null, 2) + '\n', 'utf8')
  const seed = seedTemplates[locale]
  await writeFile(join(p.architecture, 'architecture.md'), seed.architecture, 'utf8')
  await writeFile(join(p.infra, 'infra.md'), seed.infra, 'utf8')
  // data 포맷이 고정이므로 빈 상태 뷰어(index.html + css)를 미리 생성해 둔다.
  await renderViewerToDisk(root)
  // 뷰어를 여는 편의 스크립트를 package.json에 1회 추가한다(있을 때만, 베스트에포트).
  try {
    await addViewerScript(root)
  } catch {
    // package.json이 깨졌거나 쓸 수 없어도 init 자체는 성공으로 둔다.
  }
}
