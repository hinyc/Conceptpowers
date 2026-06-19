// src/init/scaffold.ts
import { mkdir, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { cpPaths } from '../paths.js'
import { parseInitConfig, type Locale } from '../schema/initConfig.js'
import { seedTemplates } from '../i18n/messages.js'
import { syncGenerated, type SyncResult } from './syncGenerated.js'

export interface ScaffoldOptions { backfillMode?: 'incremental' | 'strict'; name?: string; description?: string; locale?: Locale }
export interface ScaffoldResult { viewerScriptAdded: boolean; synced: SyncResult }

export async function isInitialized(root: string): Promise<boolean> {
  try { await access(cpPaths(root).initFile); return true } catch { return false }
}

// 생성물 패치는 init/재실행 자체를 막지 않도록 베스트에포트로 감싼다.
async function syncSafely(root: string): Promise<SyncResult> {
  try {
    return await syncGenerated(root)
  } catch {
    return { scriptStatus: 'no-package', orphansRemoved: 0 }
  }
}

export async function scaffoldInit(root: string, opts: ScaffoldOptions): Promise<ScaffoldResult> {
  const p = cpPaths(root)
  for (const d of [p.features, p.conceptsData, p.conceptsViewer, p.architecture, p.infra])
    await mkdir(d, { recursive: true })

  // 이미 초기화된 경우: baseline(개념·명세·init.json 설정)은 보존하고
  // 플러그인이 생성하는 산출물(뷰어 에셋·스크립트)만 최신으로 패치한다.
  if (await isInitialized(root)) {
    const synced = await syncSafely(root)
    return { viewerScriptAdded: synced.scriptStatus !== 'no-package', synced }
  }

  const locale: Locale = opts.locale ?? 'ko'
  const config = parseInitConfig({
    version: '0.1.0', enabled: true,
    backfillMode: opts.backfillMode ?? 'incremental',
    locale,
    project: { name: opts.name ?? '', description: opts.description ?? '' }
  })
  await writeFile(p.initFile, JSON.stringify(config, null, 2) + '\n', 'utf8')
  const seed = seedTemplates[locale]
  await writeFile(join(p.architecture, 'architecture.md'), seed.architecture, 'utf8')
  await writeFile(join(p.infra, 'infra.md'), seed.infra, 'utf8')
  // 빈 상태 뷰어 + concepts:view 스크립트를 생성한다(공유 루틴 재사용).
  const synced = await syncSafely(root)
  return { viewerScriptAdded: synced.scriptStatus !== 'no-package', synced }
}
