# jev-review

A standalone [TypeSafe Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) prototype: one System One call over a local git diff, then TypeScript policy that turns typed probabilities into a merge decision.

Jev does not write review comments. It answers Noul, Choice, and Score questions in parallel. This CLI is the System Two around that function call.

```text
git diff  →  bounded state  →  one Jev call (10 questions)  →  policy in code  →  approve | comment | request_changes | escalate
```

This is intentionally not [DRS](https://github.com/manojlds/drs). DRS can optionally hang a 19-metric Jev scorecard next to an LLM reviewer. Here Jev *is* the reviewer, and the surrounding code is the deliberation.

## Setup

Node 20+ and a TypeSafe API key ([early access](https://console.typesafe.ai/)):

```bash
pnpm install
export TYPESAFE_API_KEY=...    # or JEV_API_KEY
```

The key is sent only as `Authorization: Bearer` to `https://api.typesafe.ai`. It is never logged.

## Usage

```bash
pnpm review --help
pnpm review                         # staged + unstaged vs HEAD
pnpm review --base main
pnpm review --diff test/fixtures/synthetic.diff --task "Don't query plaintext passwords"
pnpm review --output jev-review.md
pnpm review --json
pnpm review --json --output jev-review.json
```

After `pnpm build`, `node dist/cli.js` is the same CLI (`jev-review` if you link the package).

`--output` writes the same scorecard to a file (markdown by default, JSON with `--json`) and still prints it to stdout.

Exit codes: `0` approve or comment, `1` request changes (or a tool error), `2` escalate because confidence is too low to act.

## Ignoring files

Jev's request budget is about 32k tokens. Lockfiles and binaries will blow that immediately, so the CLI never sends them by default.

Add project patterns in [`jev-review.config.json`](jev-review.config.json):

```json
{
  "ignore": [
    "pnpm-lock.yaml",
    "coverage/**",
    "*.generated.ts"
  ]
}
```

Patterns are gitignore-style (`*.md`, `dist/`, `!README.md`). Built-in defaults (lockfiles, images, wasm, source maps, …) are always included unless you set `"ignoreDefaults": false`. Pass `--config path/to/jev-review.config.json` to use another file. `.gitignore` still applies when collecting untracked files.

## What Jev is asked

All ten questions share the same state (`task`, `diff`, `files`) and run in one request:

| ID | Type | Role |
| --- | --- | --- |
| `correctness` | Score 0–4 | Is the change right relative to the task? |
| `test_gap` | Score 0–4 | How well do tests cover the change? Higher is better coverage. |
| `security` | Score 0–4 | How little new exposure does the diff add? |
| `blast_radius` | Score 0–4 | How much else can this break? Higher is more impact. |
| `safe_to_merge` | Noul | P(merge as-is) |
| `needs_human_review` | Noul | P(a person should look) |
| `has_security_concern` | Noul | P(concrete security issue in the state) |
| `change_kind` | Choice | bugfix / feature / refactor / tests / docs / chore / other |
| `primary_risk` | Choice | correctness / security / tests / complexity / none |
| `review_focus` | Choice | logic / api_contract / data / concurrency / error_handling / none |

## Policy

`src/policy.ts` is the actual reviewer. Thresholds live in code so they can change without rewriting prompts:

1. `has_security_concern >= 0.7` → `request_changes`
2. `correctness < 2` (bottom two of five levels) → `request_changes`
3. `safe_to_merge >= 0.8`, high score confidence, and `needs_human_review < 0.5` → `approve`
4. Uncertain noul or low confidence on the winning questions → `escalate`
5. Otherwise `comment` (mergeable with caveats)

## Tests and live smoke

```bash
pnpm test                 # policy, render, and state tests; no network
pnpm smoke                # live Jev call if a key is set; otherwise skips
```

Live output is written to `fixtures/live/` (gitignored). The synthetic fixture is `test/fixtures/synthetic.diff`. A sanitized scorecard from the offline security fixture is in `test/fixtures/sample-report.md`.

If no key is set, `pnpm smoke` skips the network call. Set a key and rerun it to capture a real Jev response before writing the blog post.

## Later

A [stacktoheap](https://stacktoheap.com) post will walk this prototype once a real (or faithfully captured) Jev run exists to write against. This repo stops at the CLI and scorecard.
