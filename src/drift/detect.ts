import { listConcepts } from '../store/conceptStore.js'
import { listFeatures } from '../store/featureStore.js'
import { readMappingCache } from '../mapping/scan.js'
import { readLock } from './lock.js'
import { readHistory } from './history.js'
import { contractHash } from './hash.js'

export interface DriftItem {
  slug: string
  currentHash: string
  lockedHash: string
  reason: string
  relatedPaths: string[]
}

// 개념이 마지막 정렬(lock) 이후 바뀌었는지 판정하고, 따라와야 할 관련 코드 경로를 모은다.
export async function computeDrift(root: string): Promise<DriftItem[]> {
  const [concepts, features, mapping, lock, history] = await Promise.all([
    listConcepts(root),
    listFeatures(root),
    readMappingCache(root),
    readLock(root),
    readHistory(root),
  ])
  const items: DriftItem[] = []
  for (const c of concepts) {
    const locked = lock[c.slug]?.hash
    if (locked === undefined) continue // 신규: 첫 커밋에서 등록됨
    const current = contractHash(c)
    if (locked === current) continue // 정렬됨
    const fromFeatures = features
      .filter((f) => f.concepts.includes(c.slug))
      .flatMap((f) => f.codePaths)
    const fromTags = mapping[c.slug] ?? []
    const relatedPaths = [...new Set([...fromTags, ...fromFeatures])]
    const reason =
      [...history].reverse().find((e) => e.slug === c.slug && !e.ignored)?.reason ?? ''
    items.push({ slug: c.slug, currentHash: current, lockedHash: locked, reason, relatedPaths })
  }
  return items
}
