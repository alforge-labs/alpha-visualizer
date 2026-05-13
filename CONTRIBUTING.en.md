# Contributing Guide

**English** | [日本語](CONTRIBUTING.md)

Thanks for your interest in contributing to `alpha-visualizer`! Bug reports, feature requests, documentation improvements, and code contributions are all welcome.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Development Setup](#development-setup)
- [Workflow](#workflow)
- [Commit Message Convention](#commit-message-convention)
- [Tests & Quality Gates](#tests--quality-gates)
- [Pull Request Checklist](#pull-request-checklist)
- [Release Process](#release-process)
- [Questions & Support](#questions--support)

## Code of Conduct

All participants are expected to abide by the [Contributor Covenant v2.1 Code of Conduct](CODE_OF_CONDUCT.en.md). Violations can be reported to `security@alforgelabs.com` (same address as SECURITY.md).

## Development Setup

### Prerequisites

- **Python 3.12+**
- **[uv](https://docs.astral.sh/uv/)** — Python package manager (required, do not use `pip` directly)
- **Node.js 22+ with pnpm** — for frontend development (enable via `corepack enable && corepack prepare pnpm@latest --activate` or `brew install pnpm`)
- **Git**

### Setup

```bash
# 1. Fork & clone
git clone https://github.com/<your-username>/alpha-visualizer.git
cd alpha-visualizer

# 2. Install Python dependencies
uv sync

# 3. Install frontend dependencies
cd frontend && pnpm install && cd ..

# 4. Verify (tests & lint)
uv run pytest tests/ -v
uv run ruff check src/ tests/
cd frontend && pnpm run lint && pnpm run test:ci
```

## Workflow

We follow **GitHub Flow**. Direct commits to `main` are not allowed.

1. **Find or open an issue** — discuss the change before starting
2. **Create a branch** — use prefixes such as `feat/`, `fix/`, `refactor/`, `docs/`, `test/`
3. **Test-first** — write a failing test, then implement the minimum to make it pass
4. **Commit** — follow the Conventional Commits convention (see below)
5. **Open a Pull Request** — reference the issue with `Closes #<number>`
6. **Ensure CI passes** — pytest, ruff, vitest, eslint, and playwright must all be green
7. **Address review feedback** — once approved, the PR will be squash-merged

### Branch Naming

| Prefix | Purpose |
|---|---|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `refactor/` | Refactoring without behavior changes |
| `docs/` | Documentation only |
| `test/` | Tests only |
| `chore/` | Build, CI, or tooling changes |

## Commit Message Convention

We use [Conventional Commits](https://www.conventionalcommits.org/). **Commit messages are written in Japanese** to stay consistent with the existing history.

```
<type>: <subject>

<body (optional, explaining why)>
```

Common types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `perf`.

If you are not comfortable writing Japanese, write your commit message in English and we will help reword it during review. The CHANGELOG is generated automatically from commit history via `git-cliff` (configured in `cliff.toml`).

## Tests & Quality Gates

Every PR must pass CI. Run the same checks locally before pushing.

### Backend (Python)

```bash
uv run pytest tests/ -v
uv run ruff check src/ tests/
uv run ruff check --fix src/ tests/   # auto-fix where possible
```

### Frontend (TypeScript / React)

```bash
cd frontend

pnpm run lint           # ESLint
pnpm run build          # tsc -b + vite build (type check)
pnpm run test:ci        # Vitest
pnpm run e2e:install    # first time only
pnpm run e2e            # Playwright
```

### Re-capturing Screenshots (when UI changes)

When you change the UI visually, regenerate `docs/screenshots/{ja,en}/`:

```bash
cd frontend
pnpm run e2e:install   # first time only
pnpm run screenshots
git add ../docs/screenshots/
git commit -m "docs: スクリーンショットを再撮影"
```

### Coverage Goal: 80%

Add tests for new features and bug fixes. Run `uv run pytest --cov` for backend coverage and `pnpm run test:ci -- --coverage` for frontend.

### i18n (Multilingual Support)

All UI strings must provide both Japanese and English. `frontend/src/i18n/strings.ts` exposes two APIs:

#### 1. Inline both translations (legacy)

```typescript
import { makeL } from '../i18n/strings'

function MyComponent({ lang }: { lang: Lang }) {
  const L = makeL(lang)
  return <h1>{L('戦略一覧', 'Strategies')}</h1>
}
```

Easy to read both languages at the call site — good for unique or rarely-used strings.

#### 2. Centralize in STRINGS map (recommended for shared strings)

For strings used in multiple places or where translation drift is a concern, register them in the `STRINGS` map and reference via `makeT`:

```typescript
// frontend/src/i18n/strings.ts
export const STRINGS = {
  'detail.noWfo': {
    ja: 'この戦略にはウォークフォワード（WFO）データがありません',
    en: 'No walk-forward (WFO) data for this strategy',
  },
  // ...
} as const

// Usage
import { makeT } from '../i18n/strings'

function MyComponent({ lang }: { lang: Lang }) {
  const T = makeT(lang)
  return <Note>{T('detail.noWfo')}</Note>
}
```

Key naming convention: `<scope>.<term>` (lowerCamel). Examples: `common.loading` / `detail.noWfo` / `compare.title`.

When a third language (e.g., Chinese, Korean) is added in the future, you only need to add `zh` / `ko` fields to the `STRINGS` map. We recommend gradually migrating shared strings to the map ([Issue #151](https://github.com/alforge-labs/alpha-visualizer/issues/151) tracks the phased migration).

## Pull Request Checklist

Before submitting:

- [ ] Reference the related issue with `Closes #<number>`
- [ ] CI (pytest / ruff / vitest / eslint / playwright) is green
- [ ] Tests added or updated for the change
- [ ] Manual `CHANGELOG.md` edits not required (auto-generated by git-cliff)
- [ ] UI changes include re-captured screenshots
- [ ] Public API / CLI / config changes update the [alforge-labs docs site](https://github.com/alforge-labs/alforge-labs) in the same PR or a linked PR
- [ ] Breaking changes are clearly noted in the PR description

## Release Process

Releases are performed by maintainers. See [`release.sh`](release.sh) and `.github/workflows/release.yml`.

1. Bump version with `bump-my-version`
2. Push the tag (`v0.x.y`)
3. GitHub Actions publishes to PyPI

## Questions & Support

- **Bug reports / feature requests**: [GitHub Issues](https://github.com/alforge-labs/alpha-visualizer/issues)
- **Questions / discussions**: [GitHub Discussions](https://github.com/alforge-labs/alpha-visualizer/discussions) (if enabled)
- **Security vulnerabilities**: do **not** open a public issue — see [SECURITY.en.md](SECURITY.en.md)

Thank you! 🎉
