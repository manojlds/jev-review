# jev-review

A standalone [TypeSafe Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) prototype: one System One call over a local git diff, then TypeScript policy that turns typed probabilities into a merge decision.

Jev does not write review comments. It answers Noul, Choice, and Score questions in parallel. This CLI is the System Two around that function call.

```text
git diff  →  bounded state  →  one Jev call (23 questions)  →  policy in code  →  approve | comment | request_changes | escalate
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
pnpm review                         # staged + unstaged vs HEAD; task from HEAD's message
pnpm review --base main             # working tree vs main; task from main..HEAD messages
pnpm review --commit HEAD           # that commit's patch and message
pnpm review --commit main..HEAD     # range diff + those commit messages
pnpm review --diff test/fixtures/synthetic.diff --task "Don't query plaintext passwords"
pnpm review --output jev-review.md
pnpm review --json
pnpm review --json --output jev-review.json
```

After `pnpm build`, `node dist/cli.js` is the same CLI (`jev-review` if you link the package).

Local git reviews always send a task: the commit message(s) for the reviewed range (plus a note when the working tree is dirty). `--task` overrides that intent, and the git messages are still sent as `commit_messages`. `--diff` has no git history, so it keeps the generic fallback unless you pass `--task`.

`--commit` is committed history only. `--base` (the default) includes uncommitted work. `--output` writes the same scorecard to a file (markdown by default, JSON with `--json`) and still prints it to stdout.

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

## Packing large diffs

The CLI estimates tokens (~3 characters per token) and reserves about 12k tokens for the 23-question pack (~20k left for the diff). Source files are grouped with their tests and packed first. If the change still exceeds Jev's budget, it is split into coherent slices and reviewed with one Jev call per slice.

Slice decisions combine conservatively: `request_changes` or `escalate` in any slice wins; `approve` only if every slice would approve. Scores are not averaged. The report lists each slice instead of a blended scorecard.

## What Jev is asked

All twenty-three questions share the same state (`task`, `diff`, `files`) and run in one request. Each score has a paired applicability noul. Jev still answers the score (speculative fan-out); policy uses it only when applicability is ≥ 0.5. Otherwise the report shows `n/a` instead of a misleading 0.

This is a merge gate, not a 19-metric quality loop. The extra dimensions are reliability, changeability, and compatibility. Readability, maintainability, performance, and similar agent-loop scores are out of scope.

### Scores (0–4)

| ID | Higher means | Role |
| --- | --- | --- |
| `correctness` | better | Right relative to `task`. |
| `test_gap` | better coverage | Tests cover the changed behavior. |
| `security` | less new exposure | Diff does not add a security issue. |
| `blast_radius` | **more** impact | How much else this change can break. |
| `reliability` | better | Failure paths, cleanup, retries, races. |
| `changeability` | easier next edit | How local and predictable the next conceptual change is. |
| `compatibility` | more stable | Public APIs, migrations, versions, integrations. |

`blast_radius` is “what else breaks now.” `changeability` is “how hard is the next edit.” `compatibility` is conditional: applicability should be no unless the diff shows a contract surface.

`reliability`, `changeability`, and `compatibility` each also have a `*_weakness` Choice (`no_material_issue` or a concrete failure mode). The markdown report has a Weaknesses table; a row is `n/a` when the paired score is not applicable. Every score has a paired `*_applicable` noul in `src/questions.ts`.

### Gates and classification

| ID | Type | Role |
| --- | --- | --- |
| `safe_to_merge` | Noul | P(merge as-is) |
| `needs_human_review` | Noul | P(a person should look) |
| `has_security_concern` | Noul | P(concrete security issue in the state) |
| `change_kind` | Choice | bugfix / feature / refactor / tests / docs / chore / other |
| `primary_risk` | Choice | correctness / security / tests / complexity / none |
| `review_focus` | Choice | logic / api_contract / data / concurrency / error_handling / none |

## Policy

`src/policy.ts` is the actual reviewer. Thresholds live in code so they can change without rewriting prompts:

1. `has_security_concern >= 0.7` → `request_changes`
2. Applicable `correctness < 2` (bottom two of five levels) → `request_changes`
3. `safe_to_merge >= 0.8`, high confidence on applicable scores, and `needs_human_review < 0.5` → `approve`
4. Uncertain noul or low confidence on the winning questions → `escalate`
5. Otherwise `comment` (mergeable with caveats)

Inapplicable scores are skipped: a docs-only diff does not fail for `test_gap = 0`. Applicable `reliability`, `changeability`, or `compatibility` below 3 become comment caveats, not merge blocks. They still count toward the approve confidence floor when they are applicable.

## Tests and live smoke

```bash
pnpm test                 # policy, render, and state tests; no network
pnpm smoke                # live Jev call if a key is set; otherwise skips
```

Live output is written to `fixtures/live/` (gitignored). The synthetic fixture is `test/fixtures/synthetic.diff`. A sanitized scorecard from the offline security fixture is in `test/fixtures/sample-report.md`.

If no key is set, `pnpm smoke` skips the network call. Set a key and rerun it to capture a real Jev response before writing the blog post.

## Later

A [stacktoheap](https://stacktoheap.com) post will walk this prototype once a real (or faithfully captured) Jev run exists to write against. This repo stops at the CLI and scorecard.
