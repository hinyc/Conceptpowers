# Privacy Policy

Conceptpowers runs on your machine. It collects no data about you and sends none of your code or concepts anywhere.

## What we collect

Nothing. There is no telemetry, no analytics, no account, and no crash reporting. The plugin does not call an LLM; your coding agent does the reasoning, under its own provider's terms.

## Network calls

One request leaves your machine:

- **Version check.** At session start, in a project where governance is enabled (`docs/conceptpowers/init.json` exists), the plugin sends an HTTP `GET` to `raw.githubusercontent.com` (`hinyc/Conceptpowers`, `main` branch, `.claude-plugin/plugin.json`) to learn the latest version. The request carries no project data. The result is cached for 24 hours, the request times out after 1.5 seconds, and any failure is silently ignored. GitHub may see your IP address as with any web request.

To turn it off, set `"versionCheck": false` in `docs/conceptpowers/init.json`, or set the environment variable `CONCEPTPOWERS_NO_VERSION_CHECK=1`.

The concept viewer is a local HTTP server bound to `127.0.0.1` only; it is not reachable from other machines. It starts when you run `concepts:view`, which also asks your operating system to open the default browser at its local address, or when your agent runs `viewer-link` to give you a link to a concept, which opens no browser. Once started it keeps running until you stop it, for example with `viewer-stop`.

To find this project's viewer, `viewer-link` and `viewer-stop` send `GET /api/health` to `127.0.0.1` on ports 4173–4192, so any local program listening on those ports receives that request. The viewer page calls the same endpoint on its own server. These requests stay on your computer. A viewer answers with the project name and a short hash of the project path, not the full path. To stop a viewer, `viewer-stop` sends a local `POST /api/shutdown` carrying that hash to the viewers that matched this project, and each one closes itself; no process is signaled.

## Files the plugin writes

- In your project: `docs/conceptpowers/` (concepts, alignment records, mapping cache, settings, and generated viewer files). Whether the reference fingerprint file is committed is your choice (`referenceLock` in `init.json`); it holds file names and hashes, never content.
- In your project root `package.json`, only when that file already exists: a `concepts:view` script (`node docs/conceptpowers/concepts/viewer/serve.mjs`) that opens the viewer. The plugin adds it at `init` (including re-runs) and re-adds it when the viewer files are re-synced after a plugin update or by `version-sync --force`; if you delete it in between, it stays gone until then. A `concepts:view` you wrote yourself is never overwritten (only a command the plugin generated earlier is replaced), and the plugin never creates a `package.json`. Your indentation and trailing newline are kept.
- Outside your project: the version-check cache in `~/.cache/conceptpowers` (or the directory named by `CONCEPTPOWERS_CACHE_DIR`). It contains a timestamp and a version string.
- In your system temp directory, only while `viewer-link` is starting a viewer: a lock folder `conceptpowers-viewer-<project-hash>.lock` holding the owning process ID. It is removed when the start finishes; if a start is interrupted, a later start clears it. While clearing an abandoned lock, that start briefly creates sibling folders (`.lock.recover`, and `.lock.stale-…` for the old lock being deleted) and removes them right after.

Hooks also run local `git` commands in your repository to inspect what a commit would contain. They do not change your branches, index, or working tree, but working out the tree a commit would produce can write ordinary git objects into `.git`.

## Projects without governance

In a project without `docs/conceptpowers/init.json`, the hooks exit immediately without output, files, or network calls.

## Changes and contact

Changes to this policy appear in [CHANGELOG.md](CHANGELOG.md) and the git history. Questions: open a [GitHub Issue](https://github.com/hinyc/Conceptpowers/issues). Security reports: see [SECURITY.md](SECURITY.md).
