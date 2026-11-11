# Update Concepts — C. Editing a concept or top-level baseline document at the user's request (references/edit.md)

This file is loaded by `conceptpowers:update-concepts` for trigger C, and by triggers A and F when an approved
sentence is applied. The common wrap-up and prohibitions stay in the skill's `SKILL.md`.

Run **only when the user explicitly asked** — never edit a concept on your own initiative during code work.

1. Confirm what is being edited: a concept / a feature spec / `architecture.md` / `infra.md`.
2. **When editing a concept** — before proposing the sentence to change, check only the reference locators among
   that concept's `sources` (the same scope as Reference first in `references/upgrade.md` — do not read the whole
   folder). If reference material disagrees with a green concept, the concept wins. Show the user the sentence to
   change, get approval, then:
   - Build a patch JSON holding only the changed fields (a top-level field is replaced whole — include the entire
     section you touch).
   - Apply it through the engine so the pending demotion and the reason record are guaranteed:
     `node "<cli>" edit-concept <slug> --file <patch.json> --reason "<why it changes>" --root .`
     `--reason` is required — if empty, the engine changes nothing. The reason stays as is in the drift notice and
     history. A green concept drops to `pending` (`"downgradedToPending": true`) and the viewer is redrawn.
     red and pending keep their status (`"downgradedToPending": false`) — red is still an unapproved proposal after
     the edit, so point to D (approval) at the end; pending settles after a consistency check, as in G.
   - **Never hand-edit the JSON to keep it green.** Go through the common wrap-up of `SKILL.md` (consistency check
     → attestation → re-settle to green after the user confirms).
   - **When only fields outside the contract fingerprint changed** (`sources`, `codeLinks`, `title`, `aliases`,
     `actions.interaction` — e.g. a broken source locator handed over by `scan`): **only if it was green before the
     edit, its last consistency attestation is pass, and it has no conflict reason**, the fingerprint is unchanged
     and the existing pass attestation stays valid. In that case do not re-run the consistency check; re-settle to
     green after the user confirms (the fingerprint is unchanged, so code and tests are not required to follow
     either). If any one of the three does not hold, go through the common wrap-up as usual.
   - When a concept changes, report the code impact (`@concept` tags, feature `codePaths`). If related code must
     change too, put it in the same commit; if truly no code change is needed, record that after the user
     confirms:
     `node "<cli>" attest-no-code <slug> --note "<why>" --root .`
   - **Review that concept's tests in the same commit** (conceptDrivenTests, commit gate `concept-test-follow` —
     strict denies, standard asks, light warns): find the tests through the mapping cache and `@concept` tags.
     Re-derive scenarios from the new rules, fix the tests that verified the old rules, and stage them together —
     staged tests alone pass the gate, so leave no record. Only when there is nothing to fix or no tests exist yet,
     record it after the user confirms (this record asks the human both when written and at commit):
     `node "<cli>" attest-test-review <slug> --result no-impact|no-tests --tests <paths> --note "<why>" --root .`
     (Use `--result updated` only when the tests were already fixed in an earlier commit.)
     Tests stay within the concept's scope — if a check outside the concept is needed, that is yet another concept
     edit.
3. **When editing a feature spec, architecture or infra** — the top-level baseline documents constrain the concepts below them,
   so review with the user which concepts must change along with it. Save only after the user confirms.
4. Report a summary and **restate the current status of the edited concept** — if pending, it governs no code until
   it re-settles to green via a passing consistency check + the user's confirmation; if red, until D (approval).
