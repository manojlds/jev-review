# Jev review

**Decision:** `request_changes`
**Rule:** `security_concern`
**Model:** jev-latest

Jev produced typed decisions only. Diagnose causes in the diff before changing code.

## Why

- has_security_concern=0.84 (>= 0.7)

## Scores

| Dimension | Score (0–4) | Confidence | Higher means | Nearest level |
| --- | ---: | ---: | --- | --- |
| correctness | 3.6 | 82% | better correctness | The change clearly implements `task` as shown in `diff`. |
| test_gap | 3.4 | 74% | better test coverage | The changed behavior is well covered by tests in `diff` or nearby files. |
| security | 0.4 | 90% | less new exposure | `diff` introduces a concrete, exploitable security issue. |
| blast_radius | 1.1 | 80% | larger impact elsewhere | Impact is mostly local with limited coupling. |

## Gates

| Question | P(yes) | Certainty |
| --- | ---: | ---: |
| safe_to_merge | 0.12 | 88% |
| needs_human_review | 0.18 | 82% |
| has_security_concern | 0.84 | 84% |

## Classification

| Question | Choice | Confidence |
| --- | --- | ---: |
| change_kind | bugfix | 79% |
| primary_risk | security | 86% |
| review_focus | none | 71% |

## Context

- **Source:** file:test/fixtures/synthetic.diff
- **Task:** Authenticate users without storing or querying plaintext passwords.
- **Files:** `src/login.ts`
- **Usage:** 1840 input tokens, 0 output tokens

