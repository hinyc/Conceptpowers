# Update Concepts — Batch flow (references/batch.md, define everything at once)

This file is loaded on demand when the user picks batch mode in `conceptpowers:update-concepts`
(trigger B), and its candidate-enumeration rules are reused for `newMaterial` in trigger A. The single-flow
steps, quality self-check, and status rules in `define.md` (next to this file) still apply to every
concept defined here.

## Batch flow (define everything at once)

Human-owns-contract still applies: the AI drafts and asks; the user confirms. Batch reduces the
interaction to two checkpoints, not zero.

**The qualification gate applies unchanged** (the "Qualification gate" section of `define.md`, concept
`concept-scope`). Batch definition means **gathering many candidates**, not turning every candidate into a
concept — candidates that fail the gate move down to feature specs or the top-level baseline documents, and the user
confirms that verdict at checkpoint 1.

1. **Enumerate candidates** from ALL of these sources — do not skip any (a list built from only
   one source is incomplete):
   - **`reference/` documents**: glossary terms, domain rules, spec'd behaviors.
   - **UI surfaces in the code (required)**: walk the nav menus, routes/pages, and every button /
     form submit / menu action. Walk the surfaces **without missing any**, but one surface is not one
     concept — extract from each surface **the promise it makes to the user** and list that as the candidate
     (e.g. "cancel order button" → the promise _when an order can be cancelled_; "admin menu" → the promise
     _visibility by permission_). When several surfaces realize the same promise, **merge them into one
     candidate line** — that is the qualification rule "if the purpose is the same, widen instead of creating a
     new one". A surface that yields no promise, only look / placement / wording, is marked as a **feature
     spec** candidate, not a concept candidate. This mirrors the init-strict full scan's
     feature enumeration; screens and actions that never appear in reference docs still carry
     intent worth surfacing — but whether that intent is a promise or a method is for the gate to decide.
   - **Domain logic in the code**: validation rules, permission checks, state transitions,
     terms embedded in identifiers.
     Present the merged result as a numbered candidate list — one line each
     ("payment immutability — no price/quantity change after payment", …) with the source marked
     (reference doc / UI surface / code logic).
2. **Apply the qualification gate to all candidates**: run each gathered candidate through the six questions
   of the "Qualification gate" in `define.md`, in order, and classify it as one of **concept candidate / feature
   spec / top-level baseline document / absorbed into an existing concept**. Merge candidates with the same purpose into
   one line at this step. Write the verdict and its grounds (which question it failed) on the candidate line —
   never delete silently. Candidates **absorbed into an existing concept** are not saved in this batch flow; if
   the user picks one, widen that concept through `references/edit.md` (`edit-concept --reason`).
3. **Scope confirmation (checkpoint 1)**: ask which candidates to proceed with. **Show the concept candidates that
   passed the gate together with the ones that failed (including where they go)**, and let the user overturn any
   verdict — borderline cases are the human's call. The choices
   **MUST include "All (define all candidates)" as the first option**, in addition to
   multi-selecting individual candidates — never force the user to tick every item one by one.
   Also allow adding candidates the list missed (free-form).
4. **Draft all selected**: write drafts for every selected candidate — plain language first,
   technical terms only as parenthetical aids — and present them **together** for review.
   Depth follows weight: a concept with a broad promise fills definition, analogy, allow/restrict and immutable
   rules; a concept with a narrow promise may be short (see below) — a brief definition plus one or two
   decidable rules is a complete draft, not a lazy one.
5. **Batch review (checkpoint 2)**: the user confirms / edits / drops each draft.
   - **Confirmed** drafts of **new** concepts → continue with the single-flow steps 5-9 per concept (quality self-check
     already done in drafting; run consistency check across the whole batch at once, attest each,
     then promote to `green`).
   - Drafts the user wants to **keep but not review now** → keep them `pending` (a human-written draft is born
     yellow — concept `settled-status`). `red` is reserved for proposals the full scan **auto-inferred**, so never
     put it on a human-written draft. Settle to green once the consistency check passes and the user confirms.
   - Dropped drafts → do not save.
6. Wire each saved concept to a feature spec (single-flow step 1) and `@concept` tags, then
   regenerate the viewer once at the end: `node "<cli>" render --root .`
   Record the candidates that **moved down to feature specs** at the gate at this point too (the "Recording a
   feature spec" procedure of `conceptpowers:scan`) — not becoming a concept must not make them vanish from the
   knowledge map. For candidates that **moved down to the top-level baseline documents**, propose to the user to leave one
   line in `architecture.md` / `infra.md` (that is a baseline edit, so saving goes through trigger C of
   `update-concepts`, only with the user's approval).

### Concepts from UI surfaces (may be short, but must be a promise)

A concept extracted from a UI surface **can be complete while short**. But short is not the same as one per
surface — what becomes a concept is not the button but **the promise the button keeps**.

- Pass: "the admin menu is visible only to users with admin permission" → the promise _visibility by permission_.
  Even if ten other menus and buttons keep the same promise, it is one concept.
- Pass: "the cancel-order button is enabled only for orders that have not started shipping" → the promise
  _when an order can be cancelled_.
- Fail: "put the cancel button at the bottom right, in grey" → look and placement, so it goes to the top-level baseline
  documents.
- Fail: "read the menu list once and cache it" → a method of keeping a promise, so it goes to the top-level baseline
  documents.

When writing a concept that passed:

- `description.definition`: one or two sentences — what this promise guarantees the user.
- Rules: **one decidable line clears the quality floor** — one of a visibility condition / an enablement
  condition / a behavior guarantee.
- Leave fields that do not fit (analogy, vision, lifecycle) empty — empty optional fields are normal.
- category is usually `feature` (+ `permission` if the rule is about who can see or use it).

Never let a surface slip by silently — if it does not become a concept, record **where it went** (feature spec /
top-level baseline document / absorbed into an existing concept) on the candidate line and let the user confirm it at the
checkpoint.

## Auto-inference mode (init strict full scan only)

A variant used only when the full scan (strict) of `conceptpowers:init` calls it. It skips the two human
checkpoints, and in exchange its results are saved **only as unapproved proposals (🔴 red)**. Per concept
`human-owns-contract`, a red proposal is **not a rule** — it becomes a concept's rule only once the user approves it
(update-concepts trigger D), and it governs no code before approval. So the AI is not making and saving rules on
its own. Never use this for a batch definition the user chose directly.

1. Do step 1 above (gathering candidates) as is — use **`reference/` documents and the external material in
   `reference/paths.md` without exception** as candidate sources. Auto-inference does not skip checking reference
   material (concept `reference-first-duty`).
2. Do step 2 (qualification gate) as is. Leave the verdict and grounds on the candidate line.
3. Draft only the new candidates that passed the gate, run them through the quality self-check of `define.md`, and
   save them as `status: red` (define.md step 8). Leave the reference locators in the sources (`sources`).
4. Candidates **absorbed into an existing concept** do not change that concept — only write its slug into the
   feature spec's `concepts`. If the existing concept seems to need widening, leave it in the report list for the
   user to decide later through trigger C.
5. Report the candidates that the gate stopped (feature spec / top-level baseline document) together with the list of red
   concepts saved. Promotion to green happens only through trigger D, when the user reviews and requests approval.
