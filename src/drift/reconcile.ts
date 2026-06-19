import { listConcepts } from '../store/conceptStore.js'
import { readLock, writeLock } from './lock.js'
import { appendHistory } from './history.js'
import { computeDrift } from './detect.js'
import { contractHash } from './hash.js'
import type { AlignmentLock } from '../schema/alignment.js'

export interface ReconcileResult {
  aligned: string[]
  ignored: string[]
}

// 커밋 성공 후 호출. drift였던 개념을 "코드가 따라옴(aligned)" 또는 "override(ignored)"로
// 분류하고, 어느 쪽이든 lock을 현재 해시로 재조정한다. 신규 개념은 등록만 한다.
export async function reconcileAfterCommit(
  root: string,
  committedFiles: string[],
  at?: string,
): Promise<ReconcileResult> {
  const stamp = at ?? new Date().toISOString()
  const committed = new Set(committedFiles)
  const [concepts, lock, drift] = await Promise.all([
    listConcepts(root),
    readLock(root),
    computeDrift(root),
  ])
  const driftBySlug = new Map(drift.map((d) => [d.slug, d]))
  const nextLock: AlignmentLock = { ...lock }
  const aligned: string[] = []
  const ignored: string[] = []
  for (const c of concepts) {
    const d = driftBySlug.get(c.slug)
    if (d) {
      const followed =
        d.relatedPaths.length === 0 || d.relatedPaths.every((p) => committed.has(p))
      if (followed) {
        aligned.push(c.slug)
      } else {
        ignored.push(c.slug)
        await appendHistory(root, {
          slug: c.slug,
          hash: d.currentHash,
          reason: d.reason,
          ignored: true,
          at: stamp,
        })
      }
      nextLock[c.slug] = { hash: d.currentHash, at: stamp }
    } else if (lock[c.slug] === undefined) {
      nextLock[c.slug] = { hash: contractHash(c), at: stamp }
    }
  }
  await writeLock(root, nextLock)
  return { aligned, ignored }
}
