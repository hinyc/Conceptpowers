# Privacy Policy

Conceptpowers runs on your machine. It collects no data about you and sends none of your code or concepts anywhere.

## What we collect

Nothing. There is no telemetry, no analytics, no account, and no crash reporting. The plugin does not call an LLM; your coding agent does the reasoning, under its own provider's terms.

## Network calls

There is one, and only one:

- **Version check.** At session start, in a project where governance is enabled (`docs/conceptpowers/init.json` exists), the plugin sends an HTTP `GET` to `raw.githubusercontent.com` (`hinyc/Conceptpowers`, `main` branch, `.claude-plugin/plugin.json`) to learn the latest version. The request carries no project data. The result is cached for 24 hours, the request times out after 1.5 seconds, and any failure is silently ignored. GitHub may see your IP address as with any web request.

To turn it off, set `"versionCheck": false` in `docs/conceptpowers/init.json`, or set the environment variable `CONCEPTPOWERS_NO_VERSION_CHECK=1`.

The concept viewer is a local HTTP server bound to `127.0.0.1` only; it is not reachable from other machines, and it starts only when you run it. It asks your operating system to open the default browser at its local address.

## Files the plugin writes

- In your project: `docs/conceptpowers/` (concepts, alignment records, mapping cache, settings, and generated viewer files). Whether the reference fingerprint file is committed is your choice (`referenceLock` in `init.json`); it holds file names and hashes, never content.
- Outside your project: the version-check cache in `~/.cache/conceptpowers` (or the directory named by `CONCEPTPOWERS_CACHE_DIR`). It contains a timestamp and a version string.

Hooks also run local `git` commands in your repository to inspect what a commit would contain. They do not change your branches, index, or working tree, but working out the tree a commit would produce can write ordinary git objects into `.git`.

## Projects without governance

In a project without `docs/conceptpowers/init.json`, the hooks exit immediately without output, files, or network calls.

## Changes and contact

Changes to this policy appear in [CHANGELOG.md](CHANGELOG.md) and the git history. Questions: open a [GitHub Issue](https://github.com/hinyc/Conceptpowers/issues). Security reports: see [SECURITY.md](SECURITY.md).
