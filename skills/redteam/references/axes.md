# Redteam — Per-axis reviewers and refutation (references/axes.md)

This file is loaded by `conceptpowers:redteam` for steps 2–4. The flow, the report and the prohibitions stay
in the skill's `SKILL.md`. Reviewers and refuters are given the parts of this file they need — they do not
see `SKILL.md`, so every rule they must follow is written here.

## Code classification table (step 2)

| Code branch                             | Concept compliance                      | Overreach and purpose-drift yardstick                                                                                                                  | Duplication, side effects, red-team critique |
| --------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Concept tag present (`@concept:<slug>`) | The review judgment procedure as is     | **User-visible** behavior, options or features that the concept does not require. Internal supporting code (helpers, types, branches) is not overreach | All apply                                    |
| `@concept:none` / no-concept area       | Not applicable — this is a normal state | Anything excessive for the **purpose of the work** — exports or options nobody uses, abstraction that the purpose of the work does not need (needless) | All apply                                    |
| No marker                               | —                                       | —                                                                                                                                                      | Not judged                                   |

- Do not call `@concept:none` code overreach solely because "no concept requires it". Having no concept is an
  allowed state.
- Code marked `none` that actually carries a promise (rule) to the user is only reported as a **`none`
  misclassification candidate** — deciding the marker is `scan`'s job.

## Per-axis instructions (step 3)

What every reviewer receives: the purpose confirmed in step 1 (concept side · work side) and the red-team scope, the
classification table, and the target file list.
What every reviewer observes: do not read `reference/`, do not edit code or concepts, use the result format below for
every finding.

1. **Concept compliance** — tagged files only. Judge exactly as the Judgment section of `skills/review/SKILL.md`: no
   violation / violation (which rule) / undecidable (which rule is vague and how). Emit violations as
   `Kind: violation` and undecidables as `Kind: undecidable`. Only this axis uses the word "violation".
2. **Red-team critique** — from the opposing side: inputs and situations in which this approach can be wrong, a
   simpler way, paths by which the purpose is not achieved. If the scope is "bound to purpose", discard findings whose
   grounds cannot be tied to a concept rule or the purpose of the work. If it is "include general quality", add
   security, performance and readability findings, tagged `general quality`.
3. **Duplication** — code or documents that do the same thing in two or more places, including building something new
   while an existing utility already exists. Propose one place to merge into. Flag only cases where the two places can
   change separately and drift apart — a one-line summary pointing to the original is not duplication.
4. **Overreach and purpose drift** — the per-branch yardstick in the classification table. Features, options or
   settings that were not in the purpose of the work, unused code, unrelated changes that crept in along the way.
5. **Side effects** — follow the changed code out to its callers and look for unintended behavior changes (changes in
   defaults, ordering, error handling, output format).

## Result format

```
- File and location: <path>:<line or symbol>
- Axis: <one of the five axes>
- Kind: violation | undecidable | improvement suggestion
- Severity: high | medium | low
- Grounds: <concept slug and rule sentence> or <which part of the purpose of the work> or <general quality>
- Suggested fix: <one or two lines>
```

Each axis has a default severity; raise it regardless of axis when the impact is large:

- Defaults — rule violation and side effects = **high**, duplication and overreach = **medium**, other improvement
  suggestions = **low**.
- **High** regardless of axis — a path by which the purpose is not achieved, a risk of data loss, a user-visible
  behavior change.
- A side effect may be lowered to **low** only when **all** three below hold. If any one does not, it stays high.
  1. The result received by the user or other tools (screen, output, stored data, exit code) does not change.
  2. Names, arguments, return shapes and config keys used by other files stay the same.
  3. Existing tests still pass without being modified.
  - Examples: only a log message changed, only an internal variable name changed, the result is the same and only the
    processing order changed.

## Refutation (step 4)

The refuter takes a finding and tries to prove "this is not a problem": whether it is already handled elsewhere,
whether the grounding rule was misread, whether the purpose actually requires it, whether no-concept code was branded
as overreach.

What the refuter receives: the finding, the purpose confirmed in step 1, the target files. What the refuter observes:
do not read `reference/`, do not edit code or concepts, the only grounds are the concepts, the step-1 purpose and the
code.

Result format — per finding:

```
Verdict: holds | rejected | downgraded(<new severity>)
Grounds: <two or three lines pointing at file and line>
```

- **rejected** must always carry grounds. Rejected findings are discarded — they do not go into the report.
- **downgraded** findings stay but with lower severity. If you cannot decide, leave it as **holds** and write
  "dissent" in the grounds.
- **High**-severity findings get one refuter each. **Medium and low** findings are grouped per axis and handled by one
  refuter.
- At most **10** refuters per run. If there are more, cut by severity; the findings cut off did not go through
  refutation, so include them in the report only separately and marked **unverified** — never mixed with verified
  findings.
- The refuter must be a different agent from the reviewer (the sequential procedure for when no subagents are
  available is in `SKILL.md`).
