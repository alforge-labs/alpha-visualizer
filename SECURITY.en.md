# Security Policy

**English** | [日本語](SECURITY.md)

## Supported Versions

`alpha-visualizer` provides security patches for the **latest minor release**.

| Version | Supported |
|---|---|
| 0.1.x | ✅ Supported |
| < 0.1 | ❌ Unsupported |

The `version` field in `pyproject.toml` tracks the current release.

## Reporting a Vulnerability

If you discover a security vulnerability, **please do not open a public issue** — that would tip off attackers before a fix is available.

Instead, contact us privately via one of the following channels.

### Preferred: GitHub Private Vulnerability Reporting

This repository has [Private Vulnerability Reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) enabled. You can create a draft Security Advisory visible only to you and the maintainers, and once a fix lands, the same advisory can be published with a CVE.

1. Open <https://github.com/alforge-labs/alpha-visualizer/security/advisories/new>
   (or go to the repository's **Security** tab → **Report a vulnerability**)
2. Fill out the form with:
   - Affected version(s)
   - Reproduction steps
   - Expected impact (information disclosure / RCE / DoS / etc.)
   - Suggested fix, if any

### Alternative: Email

If you cannot use GitHub, email [security@alforgelabs.com](mailto:security@alforgelabs.com). After acknowledgement we may move the discussion to a Private Vulnerability Reporting advisory if appropriate.

## Response Process & Timeline

This project is maintained by individuals working on it outside their day jobs, so the following are **best-effort targets**, not professional support SLAs.

| Stage | Target |
|---|---|
| Acknowledgement of report | within 7 days |
| Triage and reproduction | within 30 days |
| Fix release | within 90 days (depending on severity and complexity) |
| Public advisory | within 14 days after the fix release |

Severe vulnerabilities (remote code execution, authentication bypass, etc.) will be handled as quickly as possible — specific timelines will be coordinated directly with the reporter.

Responses may be delayed during long vacations or busy periods. If you have heard nothing for a month, please send a follow-up email.

## Disclosure Policy

We practice **responsible disclosure**:

1. Work with the reporter to confirm and fix the vulnerability
2. Release a patched version
3. Issue a public advisory after users have had time to update
4. Credit the reporter (if they wish)

Please refrain from public disclosure before a fix is released.

## Scope

In scope:

- `alpha-vis serve` HTTP / API endpoints
- `backtest_results.db` read paths (SQL injection, etc.)
- Strategy JSON / `ideas.json` parsers
- The frontend SPA (XSS, etc.)
- Build / release pipelines (GitHub Actions workflows)

Out of scope:

- Misconfiguration of the user's own environment (e.g. `forge-dir` permissions)
- AlphaForge engine vulnerabilities — please report those to the AlphaForge project
- Known third-party dependency CVEs without an upstream patch (please report upstream first)

## Known Security Considerations

- **`alpha-vis serve` listens on `127.0.0.1` by default.** When using `--host 0.0.0.0`, configure external access controls yourself.
- **No authentication is built in.** `alpha-vis serve` is designed for trusted networks (local development, internal networks).
- **`backtest_results.db` access uses parameterized SQLAlchemy queries**, so SQL injection at the API layer is not expected.

Thanks for helping keep the project secure! 🛡️
