// src/init/reference.ts
// docs/conceptpowers/reference/ — 사용자가 넣는 참고자료 폴더.
// 에이전트는 개념 정의/검증/감사 시 관련 자료를 on-demand로 읽는다(내용은 untrusted 데이터).
import { mkdir, writeFile, access, readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join, relative } from 'node:path'
import { cpPaths } from '../paths.js'
import { readInitConfig } from './readConfig.js'
import { seedTemplates } from '../i18n/messages.js'

const SEED_README = 'README.md'

// reference/ 폴더와 안내용 seed README를 보장한다.
// README는 사용자 전속이므로 이미 있으면 덮어쓰지 않는다(true=새로 생성함).
export async function ensureReference(root: string): Promise<boolean> {
  const dir = cpPaths(root).reference
  await mkdir(dir, { recursive: true })
  const readme = join(dir, SEED_README)
  try {
    await access(readme)
    return false // 이미 있음 — 사용자 편집 보존
  } catch {
    /* 없으면 생성 */
  }
  const locale = (await readInitConfig(root))?.locale ?? 'ko'
  await writeFile(readme, seedTemplates[locale].reference, 'utf8')
  return true
}

// 사용자가 넣은 참고 파일 목록(seed README 제외, reference/ 기준 상대경로).
// SessionStart 신호용 — 파일이 있을 때만 에이전트에 "참고하라"고 알린다.
export async function listReferenceFiles(root: string): Promise<string[]> {
  const dir = cpPaths(root).reference
  const out: string[] = []
  async function walk(d: string): Promise<void> {
    let entries: Dirent[]
    try {
      entries = await readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(d, e.name)
      if (e.isDirectory()) await walk(full)
      else out.push(relative(dir, full))
    }
  }
  await walk(dir)
  return out.filter((p) => p !== SEED_README).sort()
}
