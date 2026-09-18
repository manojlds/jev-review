import { parseDiffFiles, splitDiffHunks } from './git.js';

/** Jev's shared request budget. Questions take part of this. */
export const JEV_TOKEN_BUDGET = 32_768;
export const QUESTION_RESERVE_TOKENS = 12_000;
export const MAX_DIFF_TOKENS = JEV_TOKEN_BUDGET - QUESTION_RESERVE_TOKENS;
/** Code is denser than English; underestimate chars/token so we stay under. */
export const CHARS_PER_TOKEN = 3;

export const MAX_DIFF_CHARS = MAX_DIFF_TOKENS * CHARS_PER_TOKEN;

export interface ReviewBatch {
  files: string[];
  diff: string;
  truncated: boolean;
}

export interface ReviewPlan {
  batches: ReviewBatch[];
  omitted: string[];
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function isTestFile(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return /(^|\/)(test|tests|__tests__|spec)\//.test(normalized) || /\.(test|spec)\./.test(normalized);
}

export function isSourceFile(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return /(^|\/)(src|lib|app)\//.test(normalized) && !isTestFile(normalized);
}

export function filePriority(path: string): number {
  const normalized = path.replaceAll('\\', '/').toLowerCase();
  if (/\.(snap|map|wasm)$/.test(normalized) || normalized.includes('.generated.')) return 8;
  if (isSourceFile(path)) return 0;
  if (isTestFile(path)) return 1;
  if (/\.(ts|tsx|js|jsx|mts|cts|go|rs|py)$/.test(normalized)) return 2;
  if (normalized.endsWith('.md') || normalized.includes('readme')) return 5;
  return 4;
}

/** Pair `src/render.ts` with `test/render.test.ts`. */
export function groupKey(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  const withoutFolder = normalized.replace(/^(src|lib|app|test|tests|__tests__|spec)\//, '');
  const withoutTestSuffix = withoutFolder.replace(/\.(test|spec)(\.|$)/, '$2');
  return withoutTestSuffix.replace(/\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/, '') || normalized;
}

/**
 * Fit the diff into as few Jev calls as possible.
 * Source files stay with their tests. Overflow becomes extra slices, not silent drops.
 */
export function planReview(
  diff: string,
  files: string[],
  maxChars = MAX_DIFF_CHARS
): ReviewPlan {
  const paths = files.length > 0 ? files : parseDiffFiles(diff);
  const byFile = diffsByFile(diff, paths);
  const groups = groupFiles(
    paths.filter((file) => byFile.has(file)),
    byFile
  );

  return assembleBatches(groups, maxChars);
}

function diffsByFile(diff: string, files: string[]): Map<string, string> {
  const allowed = new Set(files);
  const chunks = new Map<string, string[]>();

  for (const hunk of splitDiffHunks(diff)) {
    const hunkFiles = parseDiffFiles(hunk).filter((file) => allowed.has(file));
    for (const file of hunkFiles) {
      const list = chunks.get(file) ?? [];
      list.push(hunk);
      chunks.set(file, list);
    }
  }

  return new Map([...chunks].map(([file, parts]) => [file, parts.join('\n')]));
}

interface FileGroup {
  key: string;
  files: string[];
  diff: string;
  priority: number;
}

function groupFiles(files: string[], byFile: Map<string, string>): FileGroup[] {
  const groups = new Map<string, FileGroup>();

  const ordered = [...files].sort((a, b) => filePriority(a) - filePriority(b) || a.localeCompare(b));
  for (const file of ordered) {
    const part = byFile.get(file);
    if (!part) continue;
    const key = groupKey(file);
    const existing = groups.get(key);
    if (existing) {
      existing.files.push(file);
      existing.diff = `${existing.diff}\n${part}`;
      existing.priority = Math.min(existing.priority, filePriority(file));
    } else {
      groups.set(key, {
        key,
        files: [file],
        diff: part,
        priority: filePriority(file),
      });
    }
  }

  return [...groups.values()];
}

function assembleBatches(groups: FileGroup[], maxChars: number): ReviewPlan {
  const sorted = [...groups].sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
  const batches: ReviewBatch[] = [];
  const omitted: string[] = [];
  let currentFiles: string[] = [];
  let currentDiffs: string[] = [];
  let used = 0;

  const flush = (): void => {
    if (currentFiles.length === 0) return;
    batches.push({
      files: [...currentFiles],
      diff: currentDiffs.join('\n'),
      truncated: false,
    });
    currentFiles = [];
    currentDiffs = [];
    used = 0;
  };

  for (const group of sorted) {
    if (group.diff.length > maxChars) {
      flush();
      const split = splitOversizedGroup(group, maxChars);
      batches.push(...split.batches);
      omitted.push(...split.omitted);
      continue;
    }

    const extra = used === 0 ? group.diff.length : group.diff.length + 1;
    if (used > 0 && used + extra > maxChars) {
      flush();
    }
    currentFiles.push(...group.files);
    currentDiffs.push(group.diff);
    used += used === 0 ? group.diff.length : group.diff.length + 1;
  }

  flush();
  return { batches, omitted };
}

function splitOversizedGroup(group: FileGroup, maxChars: number): ReviewPlan {
  const batches: ReviewBatch[] = [];
  const omitted: string[] = [];

  for (const file of group.files) {
    const hunks = splitDiffHunks(group.diff).filter((hunk) => parseDiffFiles(hunk).includes(file));
    const fileDiff = hunks.join('\n');
    if (fileDiff.length <= maxChars) {
      batches.push({ files: [file], diff: fileDiff, truncated: false });
      continue;
    }
    batches.push({
      files: [file],
      diff: `${fileDiff.slice(0, maxChars)}\n\n[diff truncated to ${maxChars} characters]`,
      truncated: true,
    });
    omitted.push(file);
  }

  return { batches, omitted };
}
