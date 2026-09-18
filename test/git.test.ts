import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  collectChange,
  formatCommitMessages,
  parseCommitSpec,
  parseDiffFiles,
  reviewTaskFromChange,
} from '../src/git.js';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDiff = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures/synthetic.diff'),
  'utf8'
);

const tempRepos: string[] = [];

afterEach(() => {
  for (const dir of tempRepos.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('parseDiffFiles', () => {
  it('reads paths from a unified diff', () => {
    expect(parseDiffFiles(fixtureDiff)).toEqual(['src/login.ts']);
  });
});

describe('collectChange', () => {
  it('reviews untracked files when the repo has no commits', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'hello.ts'), 'export const n = 1;\n');

    const change = collectChange({ cwd });

    expect(change.source).toBe('working tree (no commits yet)');
    expect(change.files).toContain('hello.ts');
    expect(change.diff).toContain('export const n = 1;');
    expect(change.commits).toEqual([]);
    expect(change.uncommitted).toBe(true);
  });

  it('diffs against HEAD once a commit exists', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'hello.ts'), 'export const n = 1;\n');
    git(['add', 'hello.ts'], cwd);
    git(['commit', '-m', 'init'], cwd);
    writeFileSync(join(cwd, 'hello.ts'), 'export const n = 2;\n');

    const change = collectChange({ cwd });

    expect(change.source).toBe('git diff HEAD');
    expect(change.files).toEqual(['hello.ts']);
    expect(change.diff).toContain('+export const n = 2;');
    expect(change.uncommitted).toBe(true);
    expect(change.commits).toHaveLength(1);
    expect(change.commits[0]?.subject).toBe('init');
  });

  it('skips lockfiles using the default ignore list', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'hello.ts'), 'export const n = 1;\n');
    writeFileSync(join(cwd, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');

    const change = collectChange({ cwd });

    expect(change.files).toContain('hello.ts');
    expect(change.files).not.toContain('pnpm-lock.yaml');
    expect(change.skipped).toContain('pnpm-lock.yaml');
  });

  it('honors jev-review.config.json ignore globs', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'hello.ts'), 'export const n = 1;\n');
    writeFileSync(join(cwd, 'notes.md'), '# notes\n');
    writeFileSync(join(cwd, 'jev-review.config.json'), JSON.stringify({ ignore: ['*.md'] }));

    const change = collectChange({ cwd });

    expect(change.files).toContain('hello.ts');
    expect(change.skipped).toContain('notes.md');
  });

  it('rejects an unknown --base', () => {
    const cwd = initRepo();
    expect(() => collectChange({ cwd, base: 'main' })).toThrow(/Unknown git revision 'main'/);
  });

  it('reviews a single --commit without the working tree', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'hello.ts'), 'export const n = 1;\n');
    git(['add', 'hello.ts'], cwd);
    git(['commit', '-m', 'Add hello\n\nExport a constant.'], cwd);
    writeFileSync(join(cwd, 'hello.ts'), 'export const n = 2;\n');
    git(['add', 'hello.ts'], cwd);
    git(['commit', '-m', 'Bump hello'], cwd);
    writeFileSync(join(cwd, 'hello.ts'), 'export const n = 3;\n');

    const change = collectChange({ cwd, commit: 'HEAD' });

    expect(change.source).toBe('git show HEAD');
    expect(change.uncommitted).toBe(false);
    expect(change.diff).toContain('+export const n = 2;');
    expect(change.diff).not.toContain('+export const n = 3;');
    expect(change.commits).toHaveLength(1);
    expect(change.commits[0]?.subject).toBe('Bump hello');
  });

  it('reviews a --commit range', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'a.ts'), 'export const a = 1;\n');
    git(['add', 'a.ts'], cwd);
    git(['commit', '-m', 'Add a'], cwd);
    git(['branch', 'base'], cwd);
    writeFileSync(join(cwd, 'b.ts'), 'export const b = 1;\n');
    git(['add', 'b.ts'], cwd);
    git(['commit', '-m', 'Add b'], cwd);
    writeFileSync(join(cwd, 'c.ts'), 'export const c = 1;\n');
    git(['add', 'c.ts'], cwd);
    git(['commit', '-m', 'Add c'], cwd);

    const change = collectChange({ cwd, commit: 'base..HEAD' });

    expect(change.source).toBe('git diff base..HEAD');
    expect(change.files.sort()).toEqual(['b.ts', 'c.ts']);
    expect(change.commits.map((commit) => commit.subject)).toEqual(['Add b', 'Add c']);
  });

  it('collects commit messages for --base including uncommitted work', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'a.ts'), 'export const a = 1;\n');
    git(['add', 'a.ts'], cwd);
    git(['commit', '-m', 'Add a'], cwd);
    git(['branch', 'base'], cwd);
    writeFileSync(join(cwd, 'b.ts'), 'export const b = 1;\n');
    git(['add', 'b.ts'], cwd);
    git(['commit', '-m', 'Add b'], cwd);
    writeFileSync(join(cwd, 'b.ts'), 'export const b = 2;\n');

    const change = collectChange({ cwd, base: 'base' });

    expect(change.source).toBe('git diff base');
    expect(change.uncommitted).toBe(true);
    expect(change.files).toEqual(['b.ts']);
    expect(change.diff).toContain('+export const b = 2;');
    expect(change.commits.map((commit) => commit.subject)).toEqual(['Add b']);
  });

  it('rejects combining --commit with --base', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'hello.ts'), 'export const n = 1;\n');
    git(['add', 'hello.ts'], cwd);
    git(['commit', '-m', 'init'], cwd);

    expect(() => collectChange({ cwd, base: 'HEAD', commit: 'HEAD' })).toThrow(
      /Use only one of --base, --commit, or --diff/
    );
  });

  it('rejects an unknown --commit', () => {
    const cwd = initRepo();
    writeFileSync(join(cwd, 'hello.ts'), 'export const n = 1;\n');
    git(['add', 'hello.ts'], cwd);
    git(['commit', '-m', 'init'], cwd);

    expect(() => collectChange({ cwd, commit: 'no-such-rev' })).toThrow(
      /Unknown git revision 'no-such-rev'/
    );
  });
});

describe('parseCommitSpec', () => {
  it('parses a single revision or a range', () => {
    expect(parseCommitSpec('HEAD')).toEqual({ kind: 'single', rev: 'HEAD' });
    expect(parseCommitSpec('main..HEAD')).toEqual({
      kind: 'range',
      from: 'main',
      to: 'HEAD',
      triple: false,
    });
    expect(parseCommitSpec('main...feature')).toEqual({
      kind: 'range',
      from: 'main',
      to: 'feature',
      triple: true,
    });
  });
});

describe('reviewTaskFromChange', () => {
  it('uses commit messages as the task for local git reviews', () => {
    const { task, commitMessages } = reviewTaskFromChange({
      diff: '',
      files: [],
      skipped: [],
      source: 'git show HEAD',
      uncommitted: false,
      commits: [{ sha: 'abcdef123', subject: 'Add applicability', body: 'Skip n/a scores.' }],
    });

    expect(task).toContain('Add applicability');
    expect(task).toContain('Skip n/a scores.');
    expect(commitMessages).toBeUndefined();
  });

  it('keeps --task and still passes git commit messages', () => {
    const { task, commitMessages } = reviewTaskFromChange(
      {
        diff: '',
        files: [],
        skipped: [],
        source: 'git diff HEAD',
        uncommitted: true,
        commits: [{ sha: 'abcdef123', subject: 'Add applicability', body: '' }],
      },
      'Do not treat missing evidence as a 0.'
    );

    expect(task).toBe('Do not treat missing evidence as a 0.');
    expect(commitMessages).toContain('Uncommitted working tree changes.');
    expect(commitMessages).toContain('Add applicability');
  });
});

describe('formatCommitMessages', () => {
  it('describes uncommitted work when there are no commits yet', () => {
    expect(formatCommitMessages([], { uncommitted: true })).toBe(
      'Uncommitted working tree changes.'
    );
  });
});

function initRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'jev-review-'));
  tempRepos.push(cwd);
  git(['init'], cwd);
  git(['config', 'user.email', 'jev@example.com'], cwd);
  git(['config', 'user.name', 'Jev Review'], cwd);
  git(['config', 'commit.gpgsign', 'false'], cwd);
  return cwd;
}

function git(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}
