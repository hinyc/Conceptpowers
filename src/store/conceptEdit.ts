// @concept:drift-reconcile @concept:human-owns-contract
// src/store/conceptEdit.ts — 명령(edit-concept)으로 개념 본문을 고치고 사유를 변경 이력에 함께 남기는 한 흐름.
// 뷰어(화면 편집)는 사유를 요구하지 않으므로 이 흐름을 쓰지 않는다(human-owns-contract).
import { readConcept, editConceptContent, type ConceptContentPatch } from './conceptStore.js';
import { noteChange } from '../drift/note.js';
import type { Concept } from '../schema/concept.js';

export interface ConceptEditResult {
  concept: Concept;
  /** 확정(green)이던 개념이 편집으로 검토 중(pending)으로 내려갔는가 */
  downgradedToPending: boolean;
}

// 사유가 비었으면 아무것도 바꾸지 않는다 — human-owns-contract "명령으로 고칠 때 사유가 비면 고치지 않는다".
export async function editConceptWithNote(
  root: string,
  slug: string,
  patch: ConceptContentPatch,
  reason: string
): Promise<ConceptEditResult> {
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new Error('reason must not be empty — say why the concept is being changed');
  }
  const before = await readConcept(root, slug);
  if (!before) throw new Error(`Concept not found: ${slug}`);
  const concept = await editConceptContent(root, slug, patch);
  await noteChange(root, slug, reason);
  return { concept, downgradedToPending: before.status === 'green' };
}
