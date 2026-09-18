import { describe, expect, it } from 'vitest';

import { parseDiffFiles } from '../src/git.js';
import { buildReviewState, MAX_DIFF_CHARS, MAX_TASK_CHARS } from '../src/state.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDiff = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures/synthetic.diff'),
  'utf8'
);

describe('parseDiffFiles', () => {
  it('reads paths from a unified diff', () => {
    expect(parseDiffFiles(fixtureDiff)).toEqual(['src/login.ts']);
  });
});

describe('buildReviewState', () => {
  it('keeps a small diff intact', () => {
    const state = buildReviewState({
      task: 'Fix login.',
      source: 'file:synthetic.diff',
      files: ['src/login.ts'],
      diff: fixtureDiff,
    });

    expect(state.truncated).toBe(false);
    expect(state.diff).toBe(fixtureDiff);
    expect(state.task).toBe('Fix login.');
  });

  it('clips commit messages sent alongside an explicit task', () => {
    const state = buildReviewState({
      task: 'Fix login.',
      commitMessages: 'x'.repeat(MAX_TASK_CHARS + 20),
      source: 'git diff HEAD',
      files: ['src/login.ts'],
      diff: fixtureDiff,
    });

    expect(state.commitMessages).toContain('[task truncated]');
    expect(state.commitMessages?.length).toBeLessThan(MAX_TASK_CHARS + 40);
  });

  it('truncates oversized diffs', () => {
    const state = buildReviewState({
      source: 'git diff HEAD',
      files: ['big.ts'],
      diff: 'x'.repeat(MAX_DIFF_CHARS + 50),
    });

    expect(state.truncated).toBe(true);
    expect(state.diff.length).toBeLessThan(MAX_DIFF_CHARS + 80);
    expect(state.diff).toContain('[diff truncated');
  });
});
