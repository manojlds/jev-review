import { describe, expect, it } from 'vitest';

import { combineSlicePolicies, decide } from '../src/policy.js';
import { buildReport, renderJson, renderMarkdown } from '../src/render.js';
import { approveAnswers, docsAnswers, securityAnswers } from './fixtures/answers.js';

const meta = {
  model: 'jev-1.13.0',
  usage: { inputTokens: 1840, outputTokens: 0 },
  task: 'Authenticate users without storing plaintext passwords.',
  taskOrigin: 'cli' as const,
  source: 'file:test/fixtures/synthetic.diff',
  files: ['src/login.ts'],
  truncated: false,
};

describe('renderMarkdown', () => {
  it('leads with the policy decision and the rule that fired', () => {
    const report = buildReport({
      answers: securityAnswers,
      policy: decide(securityAnswers),
      ...meta,
    });
    const markdown = renderMarkdown(report);

    expect(markdown).toContain('**Decision:** `request_changes`');
    expect(markdown).toContain('**Rule:** `security_concern`');
    expect(markdown).toContain('## Task');
    expect(markdown).toContain('_Captured from `--task`._');
    expect(markdown).toContain('Authenticate users without storing plaintext passwords.');
    expect(markdown).toContain('## Context');
    expect(markdown).toContain('| has_security_concern |');
    expect(markdown).toContain('src/login.ts');
  });

  it('renders an approve scorecard', () => {
    const report = buildReport({
      answers: approveAnswers,
      policy: decide(approveAnswers),
      ...meta,
    });
    const markdown = renderMarkdown(report);

    expect(markdown).toContain('**Decision:** `approve`');
    expect(markdown).toContain('| correctness | 3.6 |');
    expect(markdown).toContain('1840 input tokens');
  });

  it('shows git commit messages when --task overrode them', () => {
    const report = buildReport({
      answers: approveAnswers,
      policy: decide(approveAnswers),
      commitMessages: 'abc1234 Add applicability',
      ...meta,
    });

    expect(renderMarkdown(report)).toContain('Git commit message(s) also sent:');
    expect(renderMarkdown(report)).toContain('abc1234 Add applicability');
  });

  it('escapes angle brackets so markdown preview does not treat them as HTML', () => {
    const report = buildReport({
      answers: approveAnswers,
      policy: {
        decision: 'escalate',
        rule: 'low_confidence',
        reasons: ['primary_risk confidence=0.19 (< 0.5)'],
      },
      ...meta,
    });
    const markdown = renderMarkdown(report);

    expect(markdown).toContain('primary_risk confidence=0.19 (&lt; 0.5)');
    expect(markdown).not.toContain('(< 0.5)');
  });

  it('renders n/a instead of a zero when a score is not assessable', () => {
    const report = buildReport({
      answers: docsAnswers,
      policy: decide(docsAnswers),
      ...meta,
    });
    const markdown = renderMarkdown(report);

    expect(markdown).toContain('| test_gap | n/a | — | better test coverage | not assessable from this state |');
    expect(markdown).not.toContain('| test_gap | 0.0 |');
  });

  it('renders per-slice scorecards instead of blended scores', () => {
    const slices = [
      { files: ['src/a.ts', 'test/a.test.ts'], answers: approveAnswers, policy: decide(approveAnswers) },
      { files: ['src/login.ts'], answers: securityAnswers, policy: decide(securityAnswers) },
    ];
    const report = buildReport({
      answers: approveAnswers,
      policy: combineSlicePolicies(slices),
      slices,
      ...meta,
      files: ['src/a.ts', 'test/a.test.ts', 'src/login.ts'],
    });
    const markdown = renderMarkdown(report);

    expect(markdown).toContain('**Decision:** `request_changes`');
    expect(markdown).toContain('**Rule:** `any_slice_request_changes`');
    expect(markdown).toContain('## Slices');
    expect(markdown).toContain('### Slice 1: `src/a.ts`, `test/a.test.ts` — `approve`');
    expect(markdown).toContain('### Slice 2: `src/login.ts` — `request_changes`');
    expect(markdown).toContain('2 Jev calls');
  });
});

describe('renderJson', () => {
  it('serializes the typed report without generated review prose', () => {
    const report = buildReport({
      answers: approveAnswers,
      policy: decide(approveAnswers),
      ...meta,
    });
    const parsed = JSON.parse(renderJson(report)) as {
      decision: string;
      task: string;
      taskOrigin: string;
      scores: unknown;
    };

    expect(parsed.decision).toBe('approve');
    expect(parsed.task).toBe(meta.task);
    expect(parsed.taskOrigin).toBe('cli');
    expect(parsed.scores).toMatchObject({
      correctness: { applicable: true, score: 3.6 },
    });
  });

  it('omits a numeric score when the dimension is not applicable', () => {
    const report = buildReport({
      answers: docsAnswers,
      policy: decide(docsAnswers),
      ...meta,
    });
    const parsed = JSON.parse(renderJson(report)) as {
      scores: { test_gap: { applicable: boolean; score?: number } };
    };

    expect(parsed.scores.test_gap).toEqual({
      applicable: false,
      applicability: 0.08,
      higherMeans: 'better test coverage',
    });
    expect(parsed.scores.test_gap.score).toBeUndefined();
  });
});
