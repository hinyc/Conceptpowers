# Security Policy

## Supported versions

Only the latest release receives security fixes. Please update to the newest version before reporting. If you installed from the Conceptpowers marketplace, run both `/plugin marketplace update conceptpowers-dev` (refresh marketplace metadata) and `/plugin update conceptpowers@conceptpowers-dev` (update the plugin). If you installed from the official plugin directory, follow the "From the official plugin directory" section of the [README](README.md#install).

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub Security Advisories:

1. Open the repository's **Security** tab: <https://github.com/hinyc/Conceptpowers/security>.
2. Choose **Report a vulnerability** and describe the problem, the affected version, and how to reproduce it.

Please do not open a public issue for a security problem. For anything that is not a vulnerability, use [GitHub Issues](https://github.com/hinyc/Conceptpowers/issues).

## What to expect

This is a small, maintained-as-time-allows project. We will read your report, reply on the advisory thread, and keep you updated on whether it is accepted and how it will be fixed. We cannot promise a fixed response or fix time. Fixes ship as a new release, and we are glad to credit reporters who want it.

## Scope

Conceptpowers runs hooks and a local viewer on your machine. Reports about the following are especially welcome: the commit gate being bypassable in a way that lets unchecked changes through silently, the local viewer server accepting requests it should reject, and any unexpected file write or network call. See [PRIVACY.md](PRIVACY.md) for what the plugin is meant to read, write, and send.
