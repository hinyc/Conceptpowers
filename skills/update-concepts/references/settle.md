# Update Concepts — D. Approving a red concept · G. Re-checking and settling a pending concept (references/settle.md)

This file is loaded by `conceptpowers:update-concepts` for triggers D and G — the two status transitions that
change no concept body. The common wrap-up and prohibitions stay in the skill's `SKILL.md`.

## D. Approving a red concept (red → green)

Human-written concepts never come here (pending → green settles through a consistency attestation and the user's
confirmation). Only when the user has reviewed a 🔴 red concept that the full scan **auto-inferred** and requests
approval:

1. Run `references/consistency.md` first — green takes precedence over red, and a green↔green conflict goes back
   to the user. If a conflict remains, do not approve.
2. `node "<cli>" approve --root . <slug>` (the engine refuses without the quality floor + a fresh pass attestation).
   - Manual alternative (only when the user does it themselves): change `status` in the JSON to `green`, then
     `node "<cli>" render --root .`, and if a conflict was recorded,
     `node "<cli>" resolve-conflict <slug> --root .`. **Reverting (green → red)** is the same procedure with
     `status: red` — also only at the user's request. When the agent writes the concept file with Edit/Write an
     edit-permission prompt appears (writing via Bash shows none) — either way, proceed only for a change the user
     approved.
3. Report the result: it is now green, and if any red concept was pushed aside, say it was revised / re-flagged.
   Approve **only at the user's request** — never approve to get your own change through.

## G. Re-checking and settling a pending concept

Re-check a 🟡 pending concept (a human-written draft or an edited concept) and settle it. **Do not touch the body.**

1. Run `references/consistency.md` and leave the attestation with `attest-consistency`.
2. Pass → common wrap-up 2 of `SKILL.md` (green after the user confirms). Conflict → record the reason with
   `note-conflict`, keep it pending, and ask the user about revising / splitting it (that revision goes through
   `references/edit.md`).
