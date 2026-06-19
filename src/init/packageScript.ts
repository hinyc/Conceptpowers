// src/init/packageScript.ts
// init 시 대상 프로젝트의 package.json에 "뷰어 열기" 스크립트를 1회 추가한다.
// 플러그인 CLI는 사용자 프로젝트 PATH에 없으므로, 이미 렌더된 정적 파일을 OS opener로 연다.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const VIEWER_SCRIPT_NAME = 'concepts:view'
export const VIEWER_INDEX = 'docs/conceptpowers/concepts/viewer/index.html'

function openCommand(platform: string): string {
  if (platform === 'win32') return `start "" ${VIEWER_INDEX}`
  if (platform === 'darwin') return `open ${VIEWER_INDEX}`
  return `xdg-open ${VIEWER_INDEX}`
}

// 추가하면 true, package.json이 없거나 이미 스크립트가 있으면 false. JSON이 깨졌으면 throw.
export async function addViewerScript(
  root: string,
  platform: string = process.platform
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
    scripts: { ...scripts, [VIEWER_SCRIPT_NAME]: openCommand(platform) }
  }
  await writeFile(pkgPath, JSON.stringify(next, null, 2) + '\n', 'utf8')
  return true
}
