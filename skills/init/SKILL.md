---
name: conceptpowers-init
description: Use when the user wants to enable Conceptpowers governance on a project ("conceptpowers init", "개념 거버넌스 켜기", "concept 강제 활성화"). Scaffolds docs/conceptpowers and the activation marker.
---

# Conceptpowers: Init

Enable concept-driven governance on this project (opt-in, D3/D15).

## Steps

1. Confirm the backfill mode with the user (default: incremental):
   - **incremental** (default): scaffold + marker only. Backfill missing concepts gradually via audit.
   - **strict**: enforce a full backfill immediately (heavy for large legacy projects).
2. Confirm the output language with the user and pass it as `--lang` (`ko` or `en`, default `ko`).
   This sets `locale` in `init.json`; the agent then produces concept content, architecture/infra
   docs, and user-facing messages in that language.
3. Scaffold via the CLI (the CLI path is in the `CONCEPTPOWERS-ACTIVE` session context or the plugin dist):
   `node "<cli>" init --root . --mode <incremental|strict> --lang <ko|en>`
4. Report the result to the user: the 5 elements under `docs/conceptpowers/` (init/features/concepts/architecture/infra).
5. **Guide the user to fill in architecture.md / infra.md** (the high-level basis for concepts).
6. If strict mode, immediately continue with the `conceptpowers-audit` skill.

## Notes

- `docs/conceptpowers/` is a **read-only baseline** afterward. Modify it only via update-baseline.
- The language can be changed later by editing `locale` in `init.json`.
- If `init.json` already exists, it is not overwritten (user settings are preserved).
