---
name: redteam
description: Use when the user wants a critical, adversarial review of finished work in a governance-active project ("레드팀", "redteam", "비판적 검토", "중복 정리", "과잉 구현 점검", "목적에 맞는지 점검") — several reviewers attack the work from five angles (concept compliance, red-team critique, duplication, overreach and purpose drift, side effects) against its concepts and the purpose of the work, a refuter drops findings that do not survive, and only the findings the user picks are fixed. Three modes (changes, one concept, whole project). For a plain check that code follows its concepts use review instead. Never reads reference.
---

# Conceptpowers: Redteam (critical review)

> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.

Talk to the user in the project's output language (`locale` in `init.json`; missing → `ko`); quoted prompts, labels and report
formats below are templates to render in that language.

Review finished work **deliberately from the opposing side**. The yardsticks are the green concepts attached to the
target and the purpose of this work. Report only findings that survive refutation, and fix **only the ones the user
picks**. Concept `redteam-review` is this skill's promise.

## Boundaries with other skills

| Work                                                                   | Owner                                                             |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Judging concept-rule violations                                        | Follow the judgment procedure of `conceptpowers:review` **as is** |
| Diagnosing whether concepts are up to date                             | Use the Stage 0 diagnosis of `conceptpowers:auto` **as is**       |
| Unmarked code, `none` misclassification, tag cleanup                   | Hand off to `conceptpowers:scan`                                  |
| Editing concepts, upgrading undecidable (vague) concepts               | Hand off to `conceptpowers:update-concepts`                       |
| Red-team critique, duplication, overreach, purpose drift, side effects | **This skill**                                                    |

This skill does not re-implement the work of the skills above — it points and hands off.

## Modes

| Mode                | Target                                                                          | Source of the purpose of the work                                            |
| ------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| ① **Changes**       | Uncommitted changes + commits since the base point (+ the callers of that code) | Commit messages, related feature specs (`features/`), the user's explanation |
| ② **One concept**   | All code attached to one concept slug                                           | The concept itself                                                           |
| ③ **Whole project** | Code of every green concept + no-concept (`none`) code                          | Each concept; for `none`, what that code is used for                         |

Target collection and base-point computation are in `references/modes.md`. If the user called this **without naming a
mode**, ask — if there are changes, recommend ① first.

## Flow (common to all three modes)

**Before starting:** pick the mode, collect the target files per `references/modes.md`, then extract the set of
target concept slugs from the `@concept` markers at the top of the files. Step 0 filters with these two lists, and
step 2 reuses these markers.

### Step 0 — Check that concepts are up to date (required; concepts and code are not edited)

This step does not edit concepts or code. However, the automatic sync of generated artifacts may run before a CLI
command — if stderr shows that notice, note it in the report.

Perform the reference (3), concept status (4) and integrity (6) items of the **Stage 0** diagnosis of
`conceptpowers:auto` **with exactly the commands and readings written in that document**. Do not redefine the
commands here — only filter the result lists by the target files and target concept slugs.

- `unlocked` (no reference snapshot) or a partially compared result means freshness is unknown, so ask as below —
  do not count it as "no staleness".
- If there is **staleness that touches** the target code or the concepts attached to it, stop, show what is stale,
  and ask: (a) bring it up to date first with `conceptpowers:auto` or the relevant skill / (b) proceed as is — record
  "reviewed against stale concepts" in the report.
- Staleness that does not touch the target (red/pending elsewhere, unmarked code out of scope) does not stop the
  review; just note it in the report.
- This skill does not run `update-concepts` itself.

### Step 1 — Fix the purpose and confirm the scope

Show these to the user at once and get confirmation. Every later judgment and fix is measured against this.

1. **Concept-side purpose** — the `purpose` and rules (`actions.allow / restrict`, `principle.immutableRules`) of the
   green concepts attached to the target, in a few lines.
2. **Work-side purpose** — what this change set out to do (source per mode). For `none` code this is the only yardstick.
3. **Red-team scope** — **always ask** (never fall through to the default without asking):
   - Bound to purpose (default) — tie every finding's grounds to a concept rule or the purpose of the work. Findings
     that cannot be tied are not raised.
   - Include general quality — also raise security, performance and readability findings. Group them separately in
     the report as "out-of-purpose general quality".

If the user, looking at the concept summary, points out that it is stale, ask (a)/(b) as in step 0.

### Step 2 — Classify the code

Sort each target file into one of three by the `@concept` marker at its top (concept tag present / `none` or
no-concept area / no marker). The yardstick per branch is the classification table in `references/axes.md`. Do not
judge unmarked code — only pass the list to `conceptpowers:scan`.

### Step 3 — Per-axis reviewers (parallel)

One reviewer per axis, up to five at once: **concept compliance · red-team critique · duplication · overreach and
purpose drift · side effects**. Give each reviewer the step-1 purpose, the step-2 classification, the target file list,
and that axis's instructions (`references/axes.md`).

- An axis with nothing to cover after step 2 is not launched; record it as "not applicable" in the report (e.g. the
  concept-compliance axis when no file has a tag).
- If nothing at all is left to judge (everything unmarked, etc.), launch no reviewers, recommend `conceptpowers:scan`,
  and stop.

### Step 4 — Refutation

Argue each finding from the "this is not a problem" side. Discard rejected findings. The refuter's instructions,
result format, grouping, cap, and handling of unverified findings are in `references/axes.md`.

### Step 5 — Report

By severity (high → medium → low). For each item: file and location / axis / **violation or improvement suggestion**
/ grounds / suggested fix.

- Use **violation** only when grounded in a rule written in a concept (concept-compliance axis). Findings grounded in
  the purpose of the work or general quality are **improvement suggestions** — never call them violations.
- Separate lists: undecidable (vague concept → recommend a concept upgrade in `update-concepts`), `none`
  misclassification candidates, unmarked code (→ `scan`), findings passed over by the refutation cap (included only
  when marked **unverified**), axes skipped as not applicable, files only sampled rather than read in full, and whether you
  proceeded knowing about staleness in step 0.

### Step 6 — Fix after approval

1. Fix only the items the user picked. Do not touch items they did not pick.
2. For concept-violation items the user chooses: fix the code, or the options of verdict ② of `conceptpowers:review`
   as is (edit the concept, or split the feature/concept — editing a concept drops green to pending, and it does not
   govern code until it settles). This skill does not edit concepts. If the user picks editing or splitting a concept,
   **this review ends here** — leave the remaining items untouched, hand them over as a list, and start a new review
   after the concept settles.
3. A fix that changes behavior writes the test first (including the concept-driven test rules). When fixing code,
   update the `@concept` markers and the mapping too (`node "<cli>" map --root . <files...>`).
4. After fixing, take a light second look at only the fixed files on the three axes of **overreach, purpose drift and
   duplication** — check again that the fix did not create new overreach. Do not rerun all five axes.
5. Do not commit — the user does it or asks for it separately.

## When no subagents are available

If the environment cannot launch separate reviewers, one agent goes through the five axes **in turn**. After writing
down all findings for each axis, do the refutation **separately, after all five axes are finished** — do not refute a
finding right after writing it (you would end up defending your own finding). State "sequential review" in the report.

## Prohibited

- Reading `reference/` (reference material) — the only yardsticks are the concepts and the purpose of the work.
- Editing concepts on your own — concepts are edited only in `update-concepts`, after the user picks it.
- Fixing findings the user did not pick, or committing.
- Reporting findings that did not go through refutation as if verified.
- Calling code with `@concept:none` or in a no-concept area overreach solely because "no concept requires it".
- Calling a finding not grounded in a concept rule a "violation".
