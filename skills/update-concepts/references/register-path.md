# Update Concepts — E. Registering a reference path (references/register-path.md)

This file is loaded by `conceptpowers:update-concepts` for trigger E. The common wrap-up and
prohibitions stay in the skill's `SKILL.md`.

1. Take the path(s) (several allowed). Outside the repository use an absolute path (`~/…` when under home); inside,
   a path relative to the repository root. Settle the form of an ambiguous relative path with the user before
   registering — entries are stored exactly as written, and since `paths.md` is committed, `/Users/<name>/…`
   resolves only on that machine, and an in-repo path resolves against the repository root, not the working
   directory.
2. `node "<cli>" reference-add "<path1>" "<path2>" --root .`
3. Report the result: `added` / `skipped` (duplicate, invalid) / `external[].status` — warn on `missing` (path does
   not exist) and `empty` (no material to read). A nonexistent path is still registered (pre-registration is
   allowed) — the warning is the signal. If there is a warning, say that concept work will proceed without that
   material until it is fixed.
4. Registration only adds — removing or changing entries is done by the user editing `reference/paths.md`
   directly. The material itself is not copied into the repository (only the path is shared).
5. Since new material was registered, ask whether to continue with applying reference changes
   (`references/reference-change.md`).
