// src/concept/approve.ts
// 자동추론(red) 개념을 사용자 요청에 따라 green으로 승급한다.
// 정책(사용자 명시 요청 시에만 호출)은 conceptpowers:approve 스킬이 강제한다.
import { readConcept, setConceptStatus } from '../store/conceptStore.js'
import type { Concept } from '../schema/concept.js'

// approve는 red→green 전용이다. green(이미 승인)·pending(일관성 검사로 정착)에는
// 적용하지 않고 명확히 거부해, README가 약속한 "red 개념을 승급" 불변식을 코드로 보장한다.
export async function approveConcept(root: string, slug: string): Promise<Concept> {
  const concept = await readConcept(root, slug)
  if (!concept) throw new Error(`Concept not found: ${slug}`)
  if (concept.status !== 'red') {
    throw new Error(
      concept.status === 'green'
        ? `Concept already approved (green): ${slug}`
        : `Cannot approve a pending concept: ${slug} — approve promotes red→green; ` +
          `a pending concept settles to green via a passing consistency check.`,
    )
  }
  return setConceptStatus(root, slug, 'green')
}
