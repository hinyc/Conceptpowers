// src/init/packageScript.ts
// 대상 프로젝트의 package.json에 "뷰어 열기" 스크립트(concepts:view)를 보장한다.
// 뷰어는 data/*.json을 fetch하므로 file://가 아닌 http로 열어야 한다.
// 의존성 0인 정적 서버(serve.mjs)를 node로 실행해 기본 브라우저를 띄운다.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const VIEWER_SCRIPT_NAME = 'concepts:view'
export const VIEWER_INDEX = 'docs/conceptpowers/concepts/viewer/index.html'
export const VIEWER_SERVE = 'docs/conceptpowers/concepts/viewer/serve.mjs'

// node는 모든 플랫폼에서 동일하게 동작하므로 OS 분기가 필요 없다.
export const VIEWER_COMMAND = `node ${VIEWER_SERVE}`

// upsert 결과:
// - 'no-package': package.json 없음(스크립트 미설정)
// - 'unchanged': 이미 표준 명령과 동일
// - 'set': 신규 추가 또는 플러그인이 생성한 옛 명령을 표준으로 교체
// - 'kept': 사용자가 직접 커스텀한 값이라 보존(덮어쓰지 않음)
export type ViewerScriptStatus = 'no-package' | 'unchanged' | 'set' | 'kept'

// 우리가 과거에 생성한 명령인지 판별(관리 경로를 포함하면 우리 것).
function isPluginManaged(cmd: string): boolean {
  return cmd.includes('conceptpowers/concepts/viewer/')
}

// concepts:view를 표준 명령으로 보장한다. JSON이 깨졌으면 throw.
// 사용자 커스텀 값은 절대 덮어쓰지 않는다(우리가 만든 옛 값만 교체).
export async function upsertViewerScript(root: string): Promise<ViewerScriptStatus> {
  const pkgPath = join(root, 'package.json')
  let raw: string
  try {
    raw = await readFile(pkgPath, 'utf8')
  } catch {
    return 'no-package' // package.json 없음 — 조용히 건너뛴다
  }
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(raw)
  } catch (error) {
    throw new Error(`package.json 파싱 실패: ${(error as Error).message}`)
  }
  const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {}
  const existing = scripts[VIEWER_SCRIPT_NAME]
  if (existing === VIEWER_COMMAND) return 'unchanged'
  if (existing && !isPluginManaged(existing)) return 'kept' // 사용자 커스텀 보존
  const next = {
    ...pkg,
    scripts: { ...scripts, [VIEWER_SCRIPT_NAME]: VIEWER_COMMAND }
  }
  await writeFile(pkgPath, JSON.stringify(next, null, 2) + '\n', 'utf8')
  return 'set'
}
