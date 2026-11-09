# Update Concepts — B. Defining a new concept (references/new-concept.md)

This file is loaded by `conceptpowers:update-concepts` for trigger B. The common wrap-up and
prohibitions stay in the skill's `SKILL.md`.

- **Check reference before running (required)**: if `reference/` is empty (no files + no entries in `paths.md` —
  existence check only), say: "The reference/ folder is empty. If we proceed, concept candidates will be drawn from
  code and UI alone. If you have a glossary, PRD or external spec, adding it now improves the definitions." → ask:
  ① proceed as is ② pause while I add files ③ register an external path (`references/register-path.md`). Never skip
  silently. If the handing-over skill (`scan`, `auto`) already asked the same question in this session, do not ask
  again — follow that answer.
- If the user **already named** the concept/topic → the single flow of `references/define.md`.
- If not, ask: ① define everything at once (`references/batch.md`) ② one specific concept (single flow).
- Before saving, always go through the **duplicate check** and the **qualification gate** (define.md) — if a
  concept with the same purpose exists, do not create a new one; widen that concept through `references/edit.md`.
- If there is no feature spec (`features/`), create it together (define.md step 1) — a concept is connected to the
  knowledge map only when a feature points at it.
