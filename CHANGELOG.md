# Changelog

All notable changes to Conceptpowers are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

Versions before 1.14.0 are not summarized here; see the git history and tags.

## [Unreleased]

## [1.19.0] - 2026-11-11

### Added

- Commit-gate messages are available in English and Korean, following the project's `locale`.
- `init` writes `en` as the default output language for new projects (`init --lang ko` for Korean). Projects whose `init.json` has no `locale` are still read as Korean.
- Each skill's original text is now English. Korean translations live next to them as `SKILL.ko.md` (and `references/*.ko.md`) for human readers and are never loaded as skills.
- User-facing docs for the plugin directory: Requirements, Example prompts, Privacy / Network, Performance, and FAQ in the README, plus this changelog and the security, privacy, and contributing documents.
- A plugin icon for the plugin directory listing.

### Changed

- `main` is now a release-only branch that holds just the files the plugin needs; development happens on `develop`. `pnpm release` builds on `develop`, copies the allowed files to `main`, and tags that `main` revision.
- Built files no longer ship source maps.
- The supported Node.js range is now 20 or later (`engines`), matching the build target.

### Fixed

- The concept viewer now follows the project's `locale`.
- Several issues found in repeated red-team reviews of the plugin itself were fixed.

## [1.18.0] - 2026-10-27

### Added

- `redteam` skill: an adversarial review of finished work from five angles (concept compliance, critique, duplication, overreach and purpose drift, side effects), with a refuter step and fixes only for the findings you pick.
- `auto` offers the redteam review as an optional last step; it runs only if the user chooses it.
- No-concept areas (`noConceptGlobs` in `init.json`) and an audit for green concepts that have no linked code.
- The post-commit hook detects commits made by commands that did not look like a commit and settles/warns about them.
- `edit-concept` now requires `--reason`.

### Changed

- The plugin is now standalone; wording that depended on another plugin was removed.
- The README introduction was rewritten around the guardrail framing, with a separate list of supported agents.

### Fixed

- `strict` commit gate no longer blocks a commit only because of files without a marker.
- The code-location audit no longer mistakes abbreviations and product names in descriptions for symbols.
- The viewer server no longer drops the connection before sending a rejection response.
- Bypass and missed-detection cases in the commit gate.

## [1.17.0] - 2026-09-15

### Added

- The audit checks that the code locations named in concept evidence and code links actually exist.

### Fixed

- Session-start guidance lists are capped so injected size stays bounded.
- Alignment history is written as one file per record, which removes branch-merge conflicts.
- Built-in git commands are no longer mistaken for alias candidates, which blocked commands that do not commit.
- Coverage threshold enforcement and pre-release verification were added; index copy timestamps are preserved.
- Guidance that presented concept rules as current facts was corrected.

## [1.16.1] - 2026-09-15

### Fixed

- The commit gate builds the tree the commit would produce and reads the file list and contents directly from git.

## [1.16.0] - 2026-09-15

### Fixed

- The commit gate inspects the files that will actually be committed (command parsing was redesigned).
- The gate no longer auto-approves a command when it passes.
- Self-attested evidence can no longer be used to get past the commit gate.
- The viewer server blocks cross-site mutation requests and host spoofing reads.

### Documentation

- README gained the differences of the Codex build and a note about the marketplace `source` setting.

## [1.15.0] - 2026-09-14

### Added

- Codex (OpenAI) plugin distribution (`conceptpowers-dev` marketplace).

### Fixed

- The commit gate no longer passes silently when it fails to run.

## [1.14.0] - 2026-09-14

### Added

- Reference-material change tracking: `reference-snapshot` / `reference-diff` CLI commands and a session-start notice.

### Changed

- Skills were consolidated from 11 to 5 (`init`, `auto`, `scan`, `review`, `update-concepts`).

[Unreleased]: https://github.com/hinyc/Conceptpowers/compare/v1.18.0...HEAD
[1.18.0]: https://github.com/hinyc/Conceptpowers/compare/v1.17.0...v1.18.0
[1.17.0]: https://github.com/hinyc/Conceptpowers/compare/v1.16.1...v1.17.0
[1.16.1]: https://github.com/hinyc/Conceptpowers/compare/v1.16.0...v1.16.1
[1.16.0]: https://github.com/hinyc/Conceptpowers/compare/v1.15.0...v1.16.0
[1.15.0]: https://github.com/hinyc/Conceptpowers/compare/v1.14.3...v1.15.0
[1.14.0]: https://github.com/hinyc/Conceptpowers/compare/v1.13.0...v1.14.0
