# Review — ② One concept · ③ Whole project (references/whole.md)

This file is loaded by `conceptpowers:review` for modes ② and ③ only. Mode ① (pre-change check) never
reads it. The judgment rules, the concepts-only basis and the prohibitions stay in the skill's `SKILL.md`.

## ② Concept → files

- `slug → files` in `docs/conceptpowers/.cache/mapping.json` + the `codePaths` of features that point to that concept
  (`docs/conceptpowers/features/**`). Skip paths that are not on disk.
- If there are many files, look first at the files that touch the rules (files handling the managed state that the
  allowed/restricted actions change), and tell the user the rest are sample-checked.

## ③ Whole project

- First check mapping integrity with `node "<cli>" audit --root .` (`unknownTags`, and `duplicateSlugs` — two or more
  concept files with the same slug), then run ② for every green concept. If there are `duplicateSlugs`, it cannot be
  decided which file is authoritative for that concept: postpone its judgment and report it, so the user can confirm
  merging it into a single file via `update-concepts`.
  Red/pending concepts do not govern code, so they are not judged (list them only).

## Report (②/③)

Per concept: number of files checked / violations (file, rule, grounds) / undecidables (which rule is vague) / files
left to sample checking. Write the recommended action as one of (a)/(b)/upgrade from the judgment section of
`SKILL.md`. The baseline is read-only, so concepts are created or edited only in `update-concepts` after the user's
confirmation.
