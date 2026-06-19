---
name: conceptpowers-audit
description: Use when the user wants a full project audit ("conceptpowers audit", "개념 전수 점검", "구멍 찾기") in a Conceptpowers-active project. Finds concept-less code (gaps) and verifies existing @concept links.
---

# Conceptpowers: Audit (full audit)

Manual run. Inspect the whole project for ① unlinked gaps and ② integrity of existing links (D13).

## Steps

1. **Integrity (deterministic)**: run the CLI audit over the full source:
   `node "<cli>" audit --root . <source files...>`
   - Reports `unknownTags` (tags pointing to nonexistent concepts).
2. **Unlinked gaps (semantic judgment)**: scan the source for features/behaviors/roles/permissions/terms
   that need a concept but have no `@concept` tag. For each:
   - If a related concept already exists → suggest adding the tag (update-mapping).
   - If no concept exists → suggest define-concept.
3. **Verify existing links (semantic judgment)**: for each `@concept` link, sample-check that the code
   complies with the concept's allow/restrict/immutable rules (reuse check-concept).
4. **Unapproved concepts (status)**: the CLI audit also returns `unapproved` (all `red` concepts) and
   `unapprovedRefs` (red concepts referenced by the scanned files). List them and recommend the user
   review and approve each (see `conceptpowers-approve`). Auto-inferred concepts start `red`.
5. **Lingering pending concepts (reminder, non-blocking)**: list any concepts with `status: pending`
   (user-authored, not yet settled). Pending concepts auto-promote to `green` once they pass a
   consistency check; until then they remain pending. Remind the user to run
   `conceptpowers-check-consistency` for each or to decide whether to revise/split them.
   Do **not** refer to pending concepts as "unapproved" — they are user-authored drafts, not
   auto-inferred proposals.
6. **Report**: present the list of gaps + violations + unapproved (red) concepts + lingering pending
   (non-blocking) + recommended actions.
   - The baseline is read-only, so create/modify concepts only after user confirmation.

## Backfill modes

- incremental: report gaps only and recommend gradual backfill.
- strict: force immediate resolution of all gaps (init strict or on user request).
