# Contributing to DialogAI

Thanks for your interest in improving DialogAI! This document explains how to
report issues, request features, and submit code.

DialogAI is a local-first, browser-only app (no backend). Keep that principle in
mind for any contribution: **no telemetry, no accounts, and the only network
calls are to the API endpoints the user configures.**

## Ways to contribute

- 🐛 **Report a bug** — [open a Bug report issue](../../issues/new?template=bug_report.yml)
- 💡 **Request a feature** — [open a Feature request issue](../../issues/new?template=feature_request.yml)
- 🔧 **Send code** — via a fork and a Pull Request (see below)
- 📖 **Improve docs** — same fork + PR flow

Before opening anything new, please **search existing
[issues](../../issues)** and [pull requests](../../pulls) to avoid duplicates.

## Reporting issues

Use the issue templates — they ask for the details we need:

- **Bug report:** steps to reproduce, expected vs. actual behavior, browser/OS,
  the provider/base URL type (e.g. Ollama, OpenAI, LM Studio), and console
  errors if any.
- **Feature request:** the problem you're trying to solve, your proposed
  solution, and any alternatives you considered.

> ⚠️ **Never paste API keys, tokens, or other secrets** into an issue, PR, or
> screenshot. Redact them first.

## Contribution workflow — always fork, then PR

This project **only accepts changes through forks and pull requests.** Direct
pushes to this repository are not accepted, and the default branch is protected.
Every code or docs change — no matter how small — goes through this flow:

### 1. Fork

Click **Fork** at the top of the repo, or with the GitHub CLI:

```bash
gh repo fork jadiels/DialogAI --clone
```

### 2. Clone your fork and add the upstream remote

```bash
git clone https://github.com/<your-username>/DialogAI.git
cd DialogAI
git remote add upstream https://github.com/jadiels/DialogAI.git
```

### 3. Create a branch

Never work on the default branch of your fork. Branch off the latest upstream:

```bash
git fetch upstream
git checkout -b feat/short-description upstream/DialogAI
```

Suggested branch prefixes: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`.

### 4. Install and run

```bash
npm install
npm run dev
```

### 5. Make your change and verify it

Before committing, make sure everything passes:

```bash
npm run lint     # oxlint
npm test         # vitest
npm run build    # tsc type-check + production build
```

- Keep changes focused — one logical change per PR.
- Match the existing code style (TypeScript, functional React components,
  Tailwind classes, Zustand stores). No new dependencies unless clearly justified.
- For UI changes, include a screenshot or short clip in the PR.

### 6. Commit

Write clear, imperative commit messages (e.g. `Fix logo path on Pages subpath`).
Conventional-commit prefixes are welcome but not required.

### 7. Push and open the PR

```bash
git push -u origin feat/short-description
```

Then open a Pull Request from your fork's branch **against `jadiels/DialogAI`
(base branch: `DialogAI`)**. Fill in the PR template.

### 8. Keep your branch up to date

If the base branch moves while your PR is open:

```bash
git fetch upstream
git rebase upstream/DialogAI
git push --force-with-lease
```

## Pull request checklist

Your PR should:

- [ ] Come from a fork branch (not the default branch)
- [ ] Target the `DialogAI` branch
- [ ] Be linked to an issue when it addresses one (`Closes #123`)
- [ ] Pass `npm run lint`, `npm test`, and `npm run build`
- [ ] Keep the app backend-free (no telemetry, no accounts)
- [ ] Include screenshots for visible UI changes
- [ ] Not contain secrets or personal data

## Review & merge

- A maintainer will review your PR; please respond to feedback with follow-up
  commits (avoid force-pushing over review history unless asked, except for
  rebases).
- PRs are typically **squash-merged**, so your branch's individual commits don't
  need to be perfectly clean — the PR title/description is what lands.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](./LICENSE).
