# Redteam — Targets and purpose of the work per mode (references/modes.md)

This file is loaded by `conceptpowers:redteam` to collect the target files and the purpose of the work for
the chosen mode. The flow and the prohibitions stay in the skill's `SKILL.md`.

## ① Changes

1. **Default branch** — do not assume `main`. Find it with `git symbolic-ref --short refs/remotes/origin/HEAD`
   (strip the `origin/` prefix); if that fails, ask the user. `<default>` below is that name.
2. **Base point** — if the user gives a range, use it. Otherwise:
   - On a branch other than `<default>`: `git merge-base <default> HEAD`
   - On `<default>`: the last release tag, `git describe --tags --abbrev=0`
   - On `<default>` in a repository with no tags: the base point cannot be determined — ask the user where to start.
   - Show the chosen base point (commit) and the number of target files together at the step-1 confirmation.
3. **Targets** — files changed by commits since the base point + uncommitted changes (`git diff --name-only <base>`
   and `git status --porcelain`). Leave deleted files out of the targets, but pass their callers to the side-effects
   axis. Leave out generated files matching `ignoreGlobs` in `init.json`.
4. **Callers** — find files that use names exported by the changed files and pass them to the side-effects axis only
   (they are not targets for the other axes).
5. **If there are no targets** — say "Nothing has changed since the base point" and suggest ② one concept or
   ③ whole project. Do not launch reviewers on an empty target.
6. **Purpose of the work** — commit messages since the base point, feature specs (`features/**`) whose `codePaths`
   include the changed files, and the user's explanation. If the three disagree, show the difference at step 1 and
   let the user decide.

## ② One concept

1. Collect the targets exactly as the "② Concept → files" lookup of `conceptpowers:review` — do not redefine it here.
2. If the concept is not green (red/pending), do not review it — it is a concept that does not govern code. Recommend
   settling it first (`conceptpowers:update-concepts`).
3. The purpose of the work is that concept's `purpose`.

## ③ Whole project

1. The concept-side targets and the sample-checking rule follow the "③ Whole project" collection of
   `conceptpowers:review` as is. On top of that, add the redteam-only targets: files with `@concept:none` and files in
   a no-concept area (`noConceptGlobs`).
2. Before starting, state the scale (number of concepts and files), and record in the report the files that were only
   sampled rather than read in full.
3. In this mode the duplication axis looks across concept boundaries (whether files of different concepts do the
   same thing).
4. The purpose of the work is each concept's `purpose`; for `none` code, what that code is used for (its callers).
