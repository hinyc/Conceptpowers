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
   - On a conflict, **do not save**; ask the user to resolve it (adjust or split the concept) (rule 7).
6. On pass, save as JSON. Write the concept data file directly, then regenerate the viewer:
   `node "<cli>" render --root .`
7. Guide the user to link the concept to code with a `@concept:<slug>` tag.

## Outputs

- `docs/conceptpowers/concepts/data/<group>/<slug>.json` (schema-compliant)
- Updated viewer HTML
