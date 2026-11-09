# Update Concepts — A. Applying reference changes (references/reference-change.md)

This file is loaded by `conceptpowers:update-concepts` for trigger A. The common wrap-up and
prohibitions stay in the skill's `SKILL.md`.

1. Report the `reference-diff` result to the user: counts of changed / removed / added, `affected` (affected concept
   slugs and their status), `newMaterial` (material that may yield new concepts), `unreachable` (registered
   locations not reachable on this machine — not a deletion), `truncated` (a sign the comparison was partial — if
   present, say the result is not complete).
   Show file names to the user only, and never excerpt contents.
   If `unlocked: true`, there is no comparison snapshot — explain that `added` / `newMaterial` are not changed
   material but all material no concept cites, and ask whether to narrow it to the material the user mentioned.
2. **For each affected concept**, follow `references/upgrade.md` — re-read the reference locators written in that
   concept's sources (`sources`) and decide with the user whether the changed material and the current rules
   disagree.
   - No disagreement → leave it as is (if only the source locator is stale, fix just `sources`).
   - Disagreement → propose the sentence to change to the user and, **after approval**, apply it with the
     `edit-concept` procedure of `references/edit.md`.
   - If the material was deleted, propose removing that source or turning it into a `decision`.
   - If reference material **disagrees with a green concept, the concept wins** — report which part of which
     document differs from which rule, and do not edit the concept until the human decides.
3. If there is `newMaterial`, draw concept candidates from that material with the candidate-extraction rules of
   `references/batch.md` and propose them. Define only what the user picks, through `references/new-concept.md`.
   Never skip silently.
4. **Record the snapshot**: only after every affected concept has been handled (updated, or "left as is"), and
   with the user's confirmation. If even one is on hold, do not record it — the engine does not block on
   `--reviewed` alone, so this confirmation is the only line of defense:
   ```
   node "<cli>" reference-snapshot --reviewed --root .
   ```
   `--reviewed` is a declaration that "the affected concepts were re-examined with a human" — never add it without
   a review. If anything is still on hold, do not record it (the notice will come again next session). Report the
   result's `skipped` (files left out because they could not be read) and `mode` (`shared`/`local` — whether the
   snapshot is committed to the repository).
