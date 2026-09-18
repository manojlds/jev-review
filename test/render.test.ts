import { describe, expect, it } from 'vitest';

import { decide } from '../src/policy.js';
import { buildReport, renderJson, renderMarkdown } from '../src/render.js';
import { approveAnswers, docsAnswers, securityAnswers } from './fixtures/answers.js';

const meta = {
  model: 'jev-1.13.0',
  usage: { inputTokens: 1840, outputTokens: 0 },
  task: 'Authenticate users without storing plaintext passwords.',
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

    expect(renderMarkdown(report)).toContain('- **Commit messages:** abc1234 Add applicability');
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
});

describe('renderJson', () => {
  it('serializes the typed report without generated review prose', () => {
    const report = buildReport({
      answers: approveAnswers,
      policy: decide(approveAnswers),
      ...meta,
    });
    const parsed = JSON.parse(renderJson(report)) as { decision: string; scores: unknown };

    expect(parsed.decision).toBe('approve');
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
