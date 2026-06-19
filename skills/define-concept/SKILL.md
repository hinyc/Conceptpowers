---
name: conceptpowers-define-concept
description: Use BEFORE adding a new feature/behavior/role/permission/term when no concept covers it in a Conceptpowers-active project. Defines a structured concept (description/purpose/core actions/operating principles) and saves it after a consistency check.
---

# Conceptpowers: Define Concept

When no concept exists for a new feature/behavior/role/permission/term, define the concept first (rules 2/6).

Write the concept content in the project's output language (the `locale` from `init.json`).

## Steps (interactive)

1. Check the related feature spec in `features/`. If none exists, agree on a one-line spec with the user first.
2. Decide the concept's **category**: feature | behavior | role | permission | term (multiple allowed).
3. Fill in the following structure together with the user:
   - **Description** (`description`): core definition, analogy, components, example
   - **Purpose** (`purpose`): reason for existence, benefits, vision, pain points
   - **Core actions** (`actions`): allow / restrict / interaction
   - **Operating principles** (`principle`): immutable rules, tradeoffs, lifecycle
4. Decide the slug (kebab-case, globally unique) and group (domain).
5. **Consistency check**: run the `conceptpowers-check-consistency` skill to confirm no conflict or
   violation against existing concepts.
6. **Set the `status` — born `pending`; promote to `green` only after the step-5 consistency check passes (never default to green).**
   The agent only ever *promotes* a user-authored pending to green after a passing
   consistency check (step 5). Auto-inferred concepts (full scan) are born `red`, not pending.
   - **No conflict** (step 5 passed) → set `status: green`. The user authored it and it is
     consistent, so it becomes the source of truth.
   - **Conflict** → keep `status: pending` and record why it cannot settle:
     `node "<cli>" note-conflict <slug> --reason "<which concept it conflicts with and how>" --root .`
     Surface the conflict to the user (revise or split); do not force green.
   - **Auto-inferred during a full scan** → `status: red` (unapproved; user approves later).
7. Save as JSON (include the `status` field). Write the concept data file directly, then regenerate
   the viewer: `node "<cli>" render --root .`
   - If a previously-recorded conflict for this slug is now resolved (status set to green),
     clear it: `node "<cli>" resolve-conflict <slug> --root .`
8. Guide the user to link the concept to code with a `@concept:<slug>` tag.
9. If this **redefines an existing** concept (not a brand-new one), record why it changed so drift is
   traceable: `node "<cli>" note-change <slug> --reason "<why it changed>" --root .`

## Outputs

- `docs/conceptpowers/concepts/data/<group>/<slug>.json` (schema-compliant)
- Updated viewer HTML
