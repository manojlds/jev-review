import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { collectChange, parseDiffFiles } from '../src/git.js';
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
