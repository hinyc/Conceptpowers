// src/init/syncGenerated.ts
// 플러그인이 "생성하는" 산출물만 최신 상태로 패치한다(baseline은 절대 건드리지 않음).
// 버전업 후 기존 프로젝트가 옛 뷰어/스크립트에 묶이는 문제를 해소한다.
// 호출처: init 재실행(멱등 패치) + 전용 `sync` 명령/스킬.
import { readdir, rm, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { renderViewerToDisk } from '../viewer/render.js'
import { upsertViewerScript, type ViewerScriptStatus } from './packageScript.js'
import { cpPaths } from '../paths.js'

export interface SyncResult {
  scriptStatus: ViewerScriptStatus
  orphansRemoved: number
}

// 옛 포맷의 개념별 *.html / graph.html 고아 파일을 정리한다.
// 새 단일 SPA의 index.html(뷰어 루트)만 남기고, 비워진 디렉터리는 잘라낸다.
async function cleanLegacyViewerHtml(viewerDir: string): Promise<number> {
  const keep = join(viewerDir, 'index.html')
  let removed = 0
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        await walk(full)
        // 비워진 옛 그룹/features 디렉터리 정리(assets는 viewer.js/css가 있어 안 비워짐).
        try {
          if ((await readdir(full)).length === 0) await rmdir(full)
        } catch {
          /* 동시성/권한 문제는 무시 */
        }
      } else if (e.name.endsWith('.html') && full !== keep) {
        await rm(full)
        removed++
      }
    }
  }
  await walk(viewerDir)
  return removed
}

export async function syncGenerated(root: string): Promise<SyncResult> {
  await renderViewerToDisk(root) // 에셋 + manifest를 최신 플러그인 기준으로 재생성
  const orphansRemoved = await cleanLegacyViewerHtml(cpPaths(root).conceptsViewer)
  const scriptStatus = await upsertViewerScript(root)
  return { scriptStatus, orphansRemoved }
}
