import { describe, expect, it } from 'vitest';

import {
  estimateTokens,
  filePriority,
  groupKey,
  planReview,
} from '../src/pack.js';

function fileDiff(path: string, body: string): string {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    '@@ -1,1 +1,1 @@',
    `-${body}`,
    `+${body}!`,
  ].join('\n');
}

describe('groupKey', () => {
  it('pairs source files with their tests', () => {
    expect(groupKey('src/render.ts')).toBe('render');
    expect(groupKey('test/render.test.ts')).toBe('render');
    expect(groupKey('src/git.ts')).toBe('git');
    expect(groupKey('test/git.test.ts')).toBe('git');
  });
});

describe('filePriority', () => {
  it('ranks source above tests above docs', () => {
    expect(filePriority('src/policy.ts')).toBeLessThan(filePriority('test/policy.test.ts'));
    expect(filePriority('test/policy.test.ts')).toBeLessThan(filePriority('README.md'));
  });
});

describe('planReview', () => {
  it('keeps a small change in one slice', () => {
    const diff = fileDiff('src/login.ts', 'export const n = 1');
    const plan = planReview(diff, ['src/login.ts']);

    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0]?.files).toEqual(['src/login.ts']);
    expect(plan.omitted).toEqual([]);
  });

  it('keeps a source file with its tests even when the test hunk comes last', () => {
    const diff = [
      fileDiff('README.md', '# docs'),
      fileDiff('test/render.test.ts', 'it("renders")'),
      fileDiff('src/render.ts', 'export function render() {}'),
    ].join('\n');
    const plan = planReview(diff, ['README.md', 'test/render.test.ts', 'src/render.ts']);

    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0]?.files).toEqual(['src/render.ts', 'test/render.test.ts', 'README.md']);
  });

  it('splits overflow into slices without dropping tests', () => {
    const srcA = fileDiff('src/a.ts', 'a'.repeat(40));
    const testA = fileDiff('test/a.test.ts', 'A'.repeat(10));
    const srcB = fileDiff('src/b.ts', 'b'.repeat(40));
    const testB = fileDiff('test/b.test.ts', 'B'.repeat(10));
    const diff = [srcA, testA, srcB, testB].join('\n');
    const groupA = [srcA, testA].join('\n').length;
    const plan = planReview(diff, ['src/a.ts', 'test/a.test.ts', 'src/b.ts', 'test/b.test.ts'], groupA + 20);

    expect(plan.batches.length).toBeGreaterThan(1);
    expect(plan.omitted).toEqual([]);
    expect(plan.batches.some((batch) => batch.files.includes('src/a.ts') && batch.files.includes('test/a.test.ts'))).toBe(
      true
    );
    expect(plan.batches.some((batch) => batch.files.includes('src/b.ts') && batch.files.includes('test/b.test.ts'))).toBe(
      true
    );
  });
});

describe('estimateTokens', () => {
  it('treats code as denser than 4 chars per token', () => {
    expect(estimateTokens('x'.repeat(3000))).toBe(1000);
  });
});
