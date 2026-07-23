// @concept:none
// src/init/referencePaths.ts
// reference/paths.md — 사용자가 등록한 외부 참고자료 경로 목록(여러 개, 절대/상대, 파일/폴더).
// 여기서는 그 목록을 파싱·검증만 한다(내용은 읽지 않는다 — 내용 읽기는 개념 정의 시점의
// 에이전트 몫). 검증 결과는 세션 시작 알림과 `reference` CLI가 사용한다.
import { readFile, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { cpPaths } from '../paths.js'

export type ReferencePathStatus = 'ok' | 'missing' | 'empty'
export interface ReferencePathCheck {
  raw: string
  resolved: string
  status: ReferencePathStatus
}

export const PATHS_FILE = 'paths.md'

// 한 줄 하나(불릿 `-`/`*` 허용). 빈 줄과 `#` 시작 줄(제목·주석)은 무시.
export function parseReferencePaths(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter((line) => line !== '')
}

// `~/` → 홈 디렉터리, 절대 경로는 그대로, 나머지는 저장소 루트 기준.
export function resolveReferencePath(root: string, raw: string): string {
  if (raw === '~' || raw.startsWith('~/')) return join(homedir(), raw.slice(1))
  if (isAbsolute(raw)) return raw
  return join(root, raw)
}

// 등록된 각 경로의 상태: ok(파일 존재/자료 있는 폴더) · empty(빈 폴더) · missing(없음).
export async function checkReferencePaths(root: string): Promise<ReferencePathCheck[]> {
  let content: string
  try {
    content = await readFile(join(cpPaths(root).reference, PATHS_FILE), 'utf8')
  } catch {
    return []
  }
  const out: ReferencePathCheck[] = []
  for (const raw of parseReferencePaths(content)) {
    const resolved = resolveReferencePath(root, raw)
    let status: ReferencePathStatus
    try {
      const s = await stat(resolved)
      if (s.isDirectory()) {
        status = (await readdir(resolved)).length > 0 ? 'ok' : 'empty'
      } else {
        status = 'ok'
      }
    } catch {
      status = 'missing'
    }
    out.push({ raw, resolved, status })
  }
  return out
}
