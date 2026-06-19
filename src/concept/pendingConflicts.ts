// pending 개념의 충돌 사유 저장소. 개념 JSON을 오염시키지 않도록 .alignment에 분리 보관한다.
import { readFile } from 'node:fs/promises'
import { cpPaths } from '../paths.js'
import { writeFileAtomic } from '../util/atomicWrite.js'

export type PendingConflicts = Record<string, string>

export async function readPendingConflicts(root: string): Promise<PendingConflicts> {
  try {
    const raw = await readFile(cpPaths(root).pendingConflicts, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as PendingConflicts) : {}
  } catch {
    return {}
  }
}

export async function setPendingConflict(root: string, slug: string, reason: string): Promise<void> {
  const current = await readPendingConflicts(root)
  const next = { ...current, [slug]: reason }
  await writeFileAtomic(cpPaths(root).pendingConflicts, JSON.stringify(next, null, 2) + '\n')
}

export async function clearPendingConflict(root: string, slug: string): Promise<void> {
  const current = await readPendingConflicts(root)
  if (!(slug in current)) return
  const next = { ...current }
  delete next[slug]
  await writeFileAtomic(cpPaths(root).pendingConflicts, JSON.stringify(next, null, 2) + '\n')
}
