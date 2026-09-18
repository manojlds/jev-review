/** Built-in globs. Always applied unless `ignoreDefaults` is false in config. */
export const DEFAULT_IGNORE = [
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'Cargo.lock',
  'poetry.lock',
  'composer.lock',
  'Gemfile.lock',
  'go.sum',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.webp',
  '*.ico',
  '*.pdf',
  '*.zip',
  '*.gz',
  '*.woff',
  '*.woff2',
  '*.ttf',
  '*.eot',
  '*.map',
  '*.wasm',
  '*.bin',
] as const;

interface CompiledPattern {
  negated: boolean;
  regex: RegExp;
}

/**
 * Gitignore-style matching: last match wins, so `*.md` then `!README.md` keeps README.
 * A pattern without a slash matches in any directory.
 */
export function isIgnored(filePath: string, patterns: readonly string[]): boolean {
  const path = normalizePath(filePath);
  let ignored = false;

  for (const pattern of patterns) {
    const compiled = compilePattern(pattern);
    if (!compiled) continue;
    if (compiled.regex.test(path)) {
      ignored = !compiled.negated;
    }
  }

  return ignored;
}

export function partitionIgnored(
  files: string[],
  patterns: readonly string[]
): { files: string[]; skipped: string[] } {
  const kept: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (isIgnored(file, patterns)) skipped.push(file);
    else kept.push(file);
  }
  return { files: kept, skipped };
}

function compilePattern(raw: string): CompiledPattern | undefined {
  let pattern = raw.trim();
  if (!pattern || pattern.startsWith('#')) return undefined;

  const negated = pattern.startsWith('!');
  if (negated) pattern = pattern.slice(1);

  const dirOnly = pattern.endsWith('/');
  if (dirOnly) pattern = pattern.slice(0, -1);

  const anchored = pattern.startsWith('/') || pattern.includes('/');
  if (pattern.startsWith('/')) pattern = pattern.slice(1);

  const body = globToRegExp(pattern);
  const regex = dirOnly
    ? new RegExp(anchored ? `^${body}(?:/|$)` : `(?:^|/)${body}(?:/|$)`)
    : new RegExp(anchored ? `^${body}$` : `(?:^|/)${body}$`);

  return { negated, regex };
}

function globToRegExp(pattern: string): string {
  let result = '';
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern.startsWith('**/', i)) {
      result += '(?:.*/)?';
      i += 2;
      continue;
    }
    if (pattern[i] === '*' && pattern[i + 1] === '*') {
      result += '.*';
      i += 1;
      continue;
    }
    if (pattern[i] === '*') {
      result += '[^/]*';
      continue;
    }
    if (pattern[i] === '?') {
      result += '[^/]';
      continue;
    }
    result += escapeRegex(pattern[i]!);
  }
  return result;
}

function escapeRegex(character: string): string {
  return character.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/').replace(/^\.\//, '');
}
