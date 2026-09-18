import { describe, expect, it } from 'vitest';

import { decide } from '../src/policy.js';
import { buildReport, renderJson, renderMarkdown } from '../src/render.js';
import { approveAnswers, securityAnswers } from './fixtures/answers.js';

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
      correctness: { score: 3.6 },
    });
  });
});
