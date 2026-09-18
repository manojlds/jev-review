import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loadReviewConfig } from '../src/config.js';
import { DEFAULT_IGNORE, isIgnored } from '../src/ignore.js';

describe('isIgnored', () => {
  it('matches lockfiles and extensions in any directory', () => {
    expect(isIgnored('pnpm-lock.yaml', DEFAULT_IGNORE)).toBe(true);
    expect(isIgnored('apps/web/package-lock.json', DEFAULT_IGNORE)).toBe(true);
    expect(isIgnored('assets/logo.png', DEFAULT_IGNORE)).toBe(true);
    expect(isIgnored('src/cli.ts', DEFAULT_IGNORE)).toBe(false);
  });

  it('honors gitignore-style last-match negation', () => {
    const patterns = ['*.md', '!README.md'];
    expect(isIgnored('notes.md', patterns)).toBe(true);
    expect(isIgnored('README.md', patterns)).toBe(false);
  });

  it('matches directory prefixes', () => {
    expect(isIgnored('dist/cli.js', ['dist/'])).toBe(true);
    expect(isIgnored('src/cli.ts', ['dist/'])).toBe(false);
  });
});

describe('loadReviewConfig', () => {
  it('uses built-in defaults when no config file exists', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'jev-config-'));
    const config = loadReviewConfig(cwd);
    expect(config.ignore).toEqual([...DEFAULT_IGNORE]);
    expect(config.path).toBeUndefined();
  });

  it('appends config ignore patterns onto the defaults', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'jev-config-'));
    const path = join(cwd, 'jev-review.config.json');
    writeFileSync(path, JSON.stringify({ ignore: ['*.md', 'secret.ts'] }));

    const config = loadReviewConfig(cwd);
    expect(config.path).toBe(path);
    expect(config.ignore).toContain('*.png');
    expect(config.ignore).toContain('*.md');
    expect(config.ignore).toContain('secret.ts');
  });

  it('replaces defaults when ignoreDefaults is false', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'jev-config-'));
    writeFileSync(
      join(cwd, 'jev-review.config.json'),
      JSON.stringify({ ignoreDefaults: false, ignore: ['only-this.ts'] })
    );

    const config = loadReviewConfig(cwd);
    expect(config.ignore).toEqual(['only-this.ts']);
    expect(config.ignoreDefaults).toBe(false);
  });
});
