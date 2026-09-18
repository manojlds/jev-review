import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { loadReviewConfig } from './config.js';
import { partitionIgnored } from './ignore.js';

export interface GitCommit {
  sha: string;
  subject: string;
  body: string;
}

export type TaskOrigin = 'git' | 'cli' | 'fallback';

export interface CollectedChange {
  diff: string;
  files: string[];
  skipped: string[];
  source: string;
  commits: GitCommit[];
  uncommitted: boolean;
}

export function collectChange(options: {
  base?: string;
  commit?: string;
  diffFile?: string;
  cwd?: string;
  ignore?: string[];
  configPath?: string;
}): CollectedChange {
  const selected = [options.base, options.commit, options.diffFile].filter(Boolean);
  if (selected.length > 1) {
    throw new Error('Use only one of --base, --commit, or --diff.');
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
      commits: [],
      uncommitted: false,
    };
  }

  assertGitRepo(cwd);

  if (options.commit) {
    return collectCommit(options.commit, cwd, ignore);
  }

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
  const commits =
    range === 'HEAD' || range === 'HEAD^{commit}'
      ? logCommits(['-1', 'HEAD'], cwd)
      : logCommits(['--reverse', `${range}..HEAD`], cwd);
  return {
    diff,
    files,
    skipped,
    source: `git diff ${range}`,
    commits,
    uncommitted: isDirty(cwd),
  };
}

function collectCommit(spec: string, cwd: string, ignore: string[]): CollectedChange {
  const parsed = parseCommitSpec(spec);

  if (parsed.kind === 'single') {
    if (!revisionExists(parsed.rev, cwd)) {
      throw new Error(`Unknown git revision '${parsed.rev}'.`);
    }
    const resolved = git(['rev-parse', '--verify', `${parsed.rev}^{commit}`], cwd).trim();
    return packGitDiff({
      diff: diffSingleCommit(resolved, cwd),
      source: `git show ${parsed.rev}`,
      commits: logCommits(['-1', resolved], cwd),
      uncommitted: false,
      ignore,
    });
  }

  if (parsed.from && !revisionExists(parsed.from, cwd)) {
    throw new Error(`Unknown git revision '${parsed.from}'.`);
  }
  if (parsed.to && !revisionExists(parsed.to, cwd)) {
    throw new Error(`Unknown git revision '${parsed.to}'.`);
  }

  const from = parsed.from || 'HEAD';
  const to = parsed.to || 'HEAD';
  const diffSpec = parsed.triple ? `${from}...${to}` : `${from}..${to}`;

  return packGitDiff({
    diff: git(['diff', diffSpec], cwd),
    source: `git diff ${diffSpec}`,
    commits: logRangeCommits(from, to, parsed.triple, cwd),
    uncommitted: false,
    ignore,
  });
}

function packGitDiff(options: {
  diff: string;
  source: string;
  commits: GitCommit[];
  uncommitted: boolean;
  ignore: string[];
}): CollectedChange {
  const parsed = parseDiffFiles(options.diff);
  const { files, skipped } = partitionIgnored(parsed, options.ignore);
  return {
    diff:
      files.length === parsed.length ? options.diff : filterDiffByFiles(options.diff, files),
    files,
    skipped,
    source: options.source,
    commits: options.commits,
    uncommitted: options.uncommitted,
  };
}

export function parseCommitSpec(spec: string):
  | { kind: 'single'; rev: string }
  | { kind: 'range'; from: string; to: string; triple: boolean } {
  const trimmed = spec.trim();
  if (!trimmed) {
    throw new Error('--commit requires a revision or range (for example HEAD or main..HEAD).');
  }

  const triple = trimmed.includes('...');
  const separator = triple ? '...' : '..';
  const index = trimmed.indexOf(separator);
  if (index === -1) {
    return { kind: 'single', rev: trimmed };
  }

  return {
    kind: 'range',
    from: trimmed.slice(0, index),
    to: trimmed.slice(index + separator.length),
    triple,
  };
}

export function reviewTaskFromChange(
  change: CollectedChange,
  explicitTask?: string
): { task?: string; commitMessages?: string; origin: TaskOrigin } {
  const derived = formatCommitMessages(change.commits, { uncommitted: change.uncommitted });
  const explicit = explicitTask?.trim();
  if (explicit) {
    return { task: explicit, commitMessages: derived || undefined, origin: 'cli' };
  }
  if (derived) {
    return { task: derived, origin: 'git' };
  }
  return { origin: 'fallback' };
}

export function formatCommitMessages(
  commits: GitCommit[],
  options: { uncommitted?: boolean } = {}
): string {
  const parts: string[] = [];
  if (options.uncommitted) {
    parts.push('Uncommitted working tree changes.');
    if (commits.length > 0) {
      parts.push('Related commit message(s):');
    }
  }

  for (const commit of commits) {
    const header = `${shortSha(commit.sha)} ${commit.subject}`.trim();
    const body = commit.body.trim();
    parts.push(body ? `${header}\n\n${body}` : header);
  }

  return parts.join('\n\n').trim();
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
    commits: [],
    uncommitted: true,
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

function diffSingleCommit(rev: string, cwd: string): string {
  if (revisionExists(`${rev}^`, cwd)) {
    return git(['diff', `${rev}^`, rev], cwd);
  }
  return git(['diff-tree', '--no-commit-id', '--root', '-p', rev], cwd);
}

function logRangeCommits(from: string, to: string, triple: boolean, cwd: string): GitCommit[] {
  if (triple) {
    try {
      const mergeBase = git(['merge-base', from, to], cwd).trim();
      return logCommits(['--reverse', `${mergeBase}..${to}`], cwd);
    } catch {
      return logCommits(['--reverse', `${from}..${to}`], cwd);
    }
  }
  return logCommits(['--reverse', `${from}..${to}`], cwd);
}

function logCommits(args: string[], cwd: string): GitCommit[] {
  const raw = git(['log', '--format=%H%x1f%s%x1f%b%x1e', ...args], cwd);
  return raw
    .split('\x1e')
    .map((record) => record.replace(/^\n+/, '').trimEnd())
    .filter(Boolean)
    .map((record) => {
      const [sha = '', subject = '', ...bodyParts] = record.split('\x1f');
      return {
        sha: sha.trim(),
        subject: subject.trim(),
        body: bodyParts.join('\x1f').trim(),
      };
    })
    .filter((commit) => commit.sha);
}

function isDirty(cwd: string): boolean {
  return lines(git(['status', '--porcelain'], cwd)).length > 0;
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
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
