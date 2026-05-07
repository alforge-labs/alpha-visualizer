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

### Preferred: GitHub Security Advisories

1. Open the repository's **Security** tab
2. Click **Report a vulnerability**
3. Fill out the form with:
   - Affected version(s)
   - Reproduction steps
   - Expected impact (information disclosure / RCE / DoS / etc.)
   - Suggested fix, if any

### Alternative: Email

Email [security@alforgelabs.com](mailto:security@alforgelabs.com).

Use PGP encryption if possible — request the public key by email.

## Response Process & Timeline

| Stage | Target |
|---|---|
| Acknowledgement of report | within 2 business days |
| Triage and reproduction | within 7 business days |
| Fix release | within 30 days (depending on severity) |
| Public advisory | promptly after the fix release |

Severe vulnerabilities are handled on an accelerated timeline.

## Disclosure Policy

We practice **responsible disclosure**:

1. Work with the reporter to confirm and fix the vulnerability
2. Release a patched version
3. Issue a public advisory after users have had time to update
4. Credit the reporter (if they wish)

Please refrain from public disclosure before a fix is released.

## Scope

In scope:

- `vis serve` HTTP / API endpoints
- `forge.db` read paths (SQL injection, etc.)
- Strategy JSON / `ideas.json` parsers
- The frontend SPA (XSS, etc.)
- Build / release pipelines (GitHub Actions workflows)

Out of scope:

- Misconfiguration of the user's own environment (e.g. `forge-dir` permissions)
- AlphaForge engine vulnerabilities — please report those to the AlphaForge project
- Known third-party dependency CVEs without an upstream patch (please report upstream first)

## Known Security Considerations

- **`vis serve` listens on `127.0.0.1` by default.** When using `--host 0.0.0.0`, configure external access controls yourself.
- **No authentication is built in.** `vis serve` is designed for trusted networks (local development, internal networks).
- **`forge.db` access uses parameterized SQLAlchemy queries**, so SQL injection at the API layer is not expected.

Thanks for helping keep the project secure! 🛡️
