import { readConcept } from '../store/conceptStore.js'
import { contractHash } from './hash.js'
import { appendHistory } from './history.js'
import type { HistoryEntry } from '../schema/alignment.js'

// 개념 정의를 바꾼 직후, "왜 바꿨는지"를 현재 계약 해시와 함께 history에 남긴다.
export async function noteChange(
  root: string,
  slug: string,
  reason: string,
  at?: string,
): Promise<HistoryEntry> {
  const concept = await readConcept(root, slug)
  if (!concept) throw new Error(`Concept not found: ${slug}`)
  return appendHistory(root, { slug, hash: contractHash(concept), reason, at })
}
