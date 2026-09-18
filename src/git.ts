import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { loadReviewConfig } from './config.js';
import { partitionIgnored } from './ignore.js';

export interface CollectedChange {
  diff: string;
  files: string[];
  skipped: string[];
  source: string;
}

export function collectChange(options: {
  base?: string;
  diffFile?: string;
  cwd?: string;
  ignore?: string[];
  configPath?: string;
}): CollectedChange {
  if (options.base && options.diffFile) {
    throw new Error('Use either --base or --diff, not both.');
  }

  const cwd = options.cwd ?? process.cwd();
  const ignore = options.ignore ?? loadReviewConfig(cwd, options.configPath).ignore;

  if (options.diffFile) {
    const diff = readFileSync(options.diffFile, 'utf8');
    const parsed = parseDiffFiles(diff);
    const { files, skipped } = partitionIgnored(parsed, ignore);
    return {
      diff: files.length === parsed.length ? diff : filterDiffByFiles(diff, files),
      files,
      skipped,
      source: `file:${options.diffFile}`,
    };
  }

  assertGitRepo(cwd);
  const requested = options.base ?? 'HEAD';

  if (revisionExists(requested, cwd)) {
    return diffAgainst(requested, cwd, ignore);
  }

  if (options.base) {
    throw new Error(
      `Unknown git revision '${requested}'. Create that ref, or pass --diff <file.patch>.`
    );
  }

  return collectUnbornWorkingTree(cwd, ignore);
}

export function parseDiffFiles(diff: string): string[] {
  const files = new Set<string>();

  for (const line of diff.split('\n')) {
    const gitMatch = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (gitMatch?.[2]) {
      files.add(gitMatch[2]);
      continue;
    }

    const plusMatch = /^\+\+\+ (?:b\/)?(.+)$/.exec(line);
    if (plusMatch?.[1] && plusMatch[1] !== '/dev/null') {
      files.add(plusMatch[1]);
    }
  }

  return [...files];
}

function diffAgainst(range: string, cwd: string, ignore: string[]): CollectedChange {
  const named = lines(git(['diff', '--name-only', range], cwd));
  const { files, skipped } = partitionIgnored(named, ignore);
  const diff = files.length === 0 ? '' : git(['diff', range, '--', ...files], cwd);
  return {
    diff,
    files,
    skipped,
    source: `git diff ${range}`,
  };
}

/**
 * `git diff HEAD` is meaningless on an unborn branch. Review staged changes
 * against the empty tree, plus untracked files (honoring .gitignore).
 */
function collectUnbornWorkingTree(cwd: string, ignore: string[]): CollectedChange {
  const stagedNamed = lines(git(['diff', '--cached', '--name-only'], cwd));
  const untrackedNamed = lines(git(['ls-files', '--others', '--exclude-standard'], cwd));
  const named = [...new Set([...stagedNamed, ...untrackedNamed])];
  const { files, skipped } = partitionIgnored(named, ignore);
  const stagedFiles = stagedNamed.filter((file) => files.includes(file));
  const untrackedFiles = untrackedNamed.filter((file) => files.includes(file));
  const stagedDiff =
    stagedFiles.length === 0 ? '' : git(['diff', '--cached', '--', ...stagedFiles], cwd);
  const untrackedDiffs = untrackedFiles.map((file) => diffNewFile(file, cwd));
  const diff = [stagedDiff, ...untrackedDiffs].filter((part) => part.trim()).join('\n');

  return {
    diff,
    files,
    skipped,
    source: 'working tree (no commits yet)',
  };
}

function filterDiffByFiles(diff: string, keep: string[]): string {
  const allowed = new Set(keep);
  return splitDiffHunks(diff)
    .filter((hunk) => {
      const files = parseDiffFiles(hunk);
      return files.some((file) => allowed.has(file));
    })
    .join('\n');
}

export function splitDiffHunks(diff: string): string[] {
  const hunks: string[] = [];
  let current: string[] = [];

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ') && current.length > 0) {
      hunks.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.length > 0 && current.some((line) => line.length > 0)) {
    hunks.push(current.join('\n'));
  }

  return hunks;
}

function diffNewFile(file: string, cwd: string): string {
  return git(['diff', '--no-index', '--', '/dev/null', file], cwd, { allowDiffExit: true });
}

function revisionExists(ref: string, cwd: string): boolean {
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd);
    return true;
  } catch {
    return false;
  }
}

function assertGitRepo(cwd: string): void {
  try {
    git(['rev-parse', '--is-inside-work-tree'], cwd);
  } catch {
    throw new Error(`Not a git repository: ${cwd}`);
  }
}

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function git(
  args: string[],
  cwd: string,
  options: { allowDiffExit?: boolean } = {}
): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (options.allowDiffExit && isExecError(error) && error.status === 1) {
      return error.stdout;
    }
    const detail = isExecError(error) ? error.stderr.trim() || error.message : String(error);
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }
}

function isExecError(
  error: unknown
): error is { status: number | null; stdout: string; stderr: string; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    'stdout' in error &&
    'stderr' in error
  );
}
