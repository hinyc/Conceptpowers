// src/init/packageScript.ts
// init 시 대상 프로젝트의 package.json에 "뷰어 열기" 스크립트를 1회 추가한다.
// 뷰어는 data/*.json을 fetch하므로 file://가 아닌 http로 열어야 한다.
// 의존성 0인 정적 서버(serve.mjs)를 node로 실행해 기본 브라우저를 띄운다.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const VIEWER_SCRIPT_NAME = 'concepts:view'
export const VIEWER_INDEX = 'docs/conceptpowers/concepts/viewer/index.html'
export const VIEWER_SERVE = 'docs/conceptpowers/concepts/viewer/serve.mjs'

// node는 모든 플랫폼에서 동일하게 동작하므로 OS 분기가 필요 없다.
function openCommand(): string {
  return `node ${VIEWER_SERVE}`
}

// 추가하면 true, package.json이 없거나 이미 스크립트가 있으면 false. JSON이 깨졌으면 throw.
export async function addViewerScript(
  root: string,
  _platform: string = process.platform
): Promise<boolean> {
  const pkgPath = join(root, 'package.json')
  let raw: string
  try {
    raw = await readFile(pkgPath, 'utf8')
  } catch {
    return false // package.json 없음 — 조용히 건너뛴다
  }
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(raw)
  } catch (error) {
    throw new Error(`package.json 파싱 실패: ${(error as Error).message}`)
  }
  const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {}
  if (scripts[VIEWER_SCRIPT_NAME]) return false // 기존 스크립트 보존
  const next = {
    ...pkg,
    scripts: { ...scripts, [VIEWER_SCRIPT_NAME]: openCommand() }
  }
  await writeFile(pkgPath, JSON.stringify(next, null, 2) + '\n', 'utf8')
  return true
}
