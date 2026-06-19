// src/concept/approve.ts
// 자동추론(red) 개념을 사용자 요청에 따라 green으로 승급한다.
// 정책(사용자 명시 요청 시에만 호출)은 conceptpowers-approve 스킬이 강제한다.
import { setConceptStatus } from '../store/conceptStore.js'
import type { Concept } from '../schema/concept.js'

export async function approveConcept(root: string, slug: string): Promise<Concept> {
  return setConceptStatus(root, slug, 'green')
}
