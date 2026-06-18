// src/concept/approve.ts
// 개념을 green(승인)으로 전환한다. approvalMode='cli'일 때만 허용하며,
// 기본(manual)에서는 에이전트/CLI 자동 승인을 막아 사용자가 직접 status를 수정하게 한다.
import { readInitConfig } from '../init/readConfig.js'
import { setConceptStatus } from '../store/conceptStore.js'
import type { Concept } from '../schema/concept.js'

export async function approveConcept(root: string, slug: string): Promise<Concept> {
  const config = await readInitConfig(root)
  const mode = config?.approvalMode ?? 'manual'
  if (mode !== 'cli') {
    throw new Error(
      `Approval via CLI is disabled (approvalMode='${mode}'). ` +
        `Set "approvalMode": "cli" in init.json to enable the approve flow, ` +
        `or edit the concept's "status" field to "green" manually.`,
    )
  }
  return setConceptStatus(root, slug, 'green')
}
