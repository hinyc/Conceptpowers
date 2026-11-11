# Contributing

Thanks for helping. Bug reports, concept-schema proposals, and CDD workflow ideas are welcome as [GitHub Issues](https://github.com/hinyc/Conceptpowers/issues). Pull requests are welcome too.

## Branches

- **`develop`** is where all development happens. Open pull requests against it.
- **`main`** is deployment-only. It holds just the files users install, and it is updated by the release flow below, never by hand. The allowed files are: `.claude-plugin`, `.codex-plugin`, `.agents`, `hooks`, `skills`, `dist`, `assets`, `src`, `README*`, `LICENSE`, `CHANGELOG.md`, `SECURITY.md`, `PRIVACY.md`, `CONTRIBUTING.md`, `package.json`, `.gitignore`.

## Setup and commands

The project uses [pnpm](https://pnpm.io/). The engine lives in `src/` (TypeScript, ESM).

```bash
pnpm install
pnpm build          # bundle src/ into dist/ (hooks run dist/hooks/*.js directly)
pnpm test           # vitest
pnpm test:coverage  # coverage; the project expects 80%+
pnpm typecheck      # tsc --noEmit
pnpm format         # prettier --write .
```

Run `pnpm build`, `pnpm typecheck`, and `pnpm test` before you submit. If you change `src/schema/concept.ts`, check the viewer and the audit, which both read the schema.

## Generated files

`dist/` and `assets/serve.mjs` are build outputs (`assets/serve.mjs` is bundled from `src/viewer/serve.ts`). Do not edit them by hand; change the source and rebuild.

## Concepts and the baseline

Conceptpowers governs itself: the concepts in `docs/conceptpowers/` are the baseline. Do not edit baseline concepts on your own judgment. A change needs the maintainer's explicit approval and goes through the `update-concepts` skill (`edit-concept`), which sets the concept back to pending until a consistency check passes and the change is confirmed.

## Commits

Use `<type>: <description>` with a type from `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, plus an optional body.

The commit gate is a `PreToolUse` hook, so it reads the command before it runs. Run **`git add` and `git commit` as separate commands**; chaining them makes the committed files unknowable in advance and the gate will block or ask.

## Releasing (maintainers)

Updates reach users only when the `version` string changes, so pushing commits alone is not enough. Releases are cut from `develop`:

```bash
pnpm release <patch|minor|major|x.y.z> [--yes]
pnpm release --resume [--yes]
```

The command requires a clean tree on `develop` and then:

1. checks that the four manifests carry the same `description` and that local `main` is usable (see below), then verifies (type check, tests against the coverage threshold, format check);
2. syncs the version across `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, and `package.json`;
3. rebuilds `dist/` (hooks run `dist/*.js` directly, so a release without a rebuild ships stale hooks);
4. commits the release on `develop`, then commits only the allowed files to `main` and tags that `main` commit with an annotated tag `vX.Y.Z`.

If the sync would delete more than 10 files from `main` (for example the first release after the `develop`/`main` split), the command lists them and stops before changing anything. Review the list and run it again with `--yes`.

Local `main` is checked against the remote-tracking ref only (no fetch). If `main` is missing but `origin/main` exists, or `main` is behind `origin/main`, the command stops and tells you how to sync. A first deployment with neither requires `--yes`.

If anything fails between the version bump and the `develop` release commit (build, render, commit), the release paths are restored to the starting state, so you can fix the cause and run it again. If it fails after the `develop` release commit (for example a stale `.git/refs/heads/main.lock`, or a tag signing failure), `develop` already carries the new version and the command prints a recovery note. Fix the cause and finish the same version with:

```bash
pnpm release --resume
```

`--resume` requires `develop` HEAD to be the `chore(release): vX.Y.Z` commit. It reuses `main` if it already has that tree and only adds the missing tag. The same `--yes` rule applies: if the failed release was the first one (or would still delete more than 10 files from `main`), run `pnpm release --resume --yes`.

The command never pushes. A person pushes both branches and the tag after checking the result, using the command the script prints (`--atomic`, so all refs update or none do):

```bash
git push --atomic origin develop main refs/tags/vX.Y.Z
```

`git push --follow-tags` is not enough: the tag points at a `main` commit, which is not reachable from `develop`. Add the release to [CHANGELOG.md](CHANGELOG.md) before cutting it.

## Codex marketplace notes (maintainers)

- The marketplace entry in `.agents/plugins/marketplace.json` must use `"source": { "source": "url", "url": "./" }`. A `"local"` source pointing at the repository root (`"./"` or `"."`) makes Codex report `plugin not found`. The `url` form resolves against the Git snapshot Codex clones when the marketplace is added from GitHub.
- `.agents/plugins/marketplace.json` has no `version` field. The version Codex installs comes from `.codex-plugin/plugin.json`, which `pnpm release` keeps in sync.
- To verify a Codex install, isolate it with a throwaway `CODEX_HOME` so your own setup is untouched.
- Codex does not run plugin hooks until they are trusted (`/hooks` in Codex).

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).
