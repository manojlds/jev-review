#!/usr/bin/env node
import { parseArgs } from 'node:util';

import { toReviewAnswers, usageFrom } from './answers.js';
import { evaluateReview } from './client.js';
import { formatCliError } from './errors.js';
import { collectChange } from './git.js';
import { decide, exitCodeFor } from './policy.js';
import { buildReport, renderJson, renderMarkdown } from './render.js';
import { buildReviewState } from './state.js';

const HELP = `jev-review — typed TypeSafe Jev decisions over a local git diff

Usage:
  jev-review [--base <ref>] [--task <text>] [--json]
  jev-review --diff <file.patch> [--task <text>] [--json]

Options:
  --base <ref>   Diff the working tree against this ref (default: HEAD, or the
                 working tree if this repo has no commits yet)
  --diff <file>  Review a patch file instead of a git range
  --task <text>  What the change is supposed to do
  --config <path>
                 jev-review.config.json (default: ./jev-review.config.json)
  --json         Print a machine-readable report
  --help         Show this help

Auth:
  TYPESAFE_API_KEY or JEV_API_KEY

Exit codes:
  0  approve or comment
  1  request_changes, or a tool error
  2  escalate (low confidence)
`;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      base: { type: 'string' },
      diff: { type: 'string' },
      task: { type: 'string' },
      config: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const change = collectChange({
    base: values.base,
    diffFile: values.diff,
    configPath: values.config,
  });

  if (change.skipped.length > 0) {
    process.stderr.write(
      `Ignoring ${change.skipped.length} file(s): ${change.skipped.join(', ')}\n`
    );
  }

  if (!change.diff.trim()) {
    process.stderr.write('No changes to review.\n');
    return 0;
  }

  const state = buildReviewState({
    task: values.task,
    source: change.source,
    files: change.files,
    omitted: change.skipped,
    diff: change.diff,
  });

  const extraOmitted = state.omitted.filter((file) => !change.skipped.includes(file));
  if (extraOmitted.length > 0) {
    process.stderr.write(
      `Truncated ${extraOmitted.length} file(s) to fit Jev's token budget: ${extraOmitted.join(', ')}\n`
    );
  }

  process.stderr.write(
    `Evaluating ${state.files.length || 'unlisted'} file(s) from ${state.source} with Jev…\n`
  );

  const result = await evaluateReview(state);
  const answers = toReviewAnswers(result.answers);
  const policy = decide(answers);
  const report = buildReport({
    answers,
    policy,
    model: result.model,
    usage: usageFrom(result),
    task: state.task,
    source: state.source,
    files: state.files,
    omitted: state.omitted,
    truncated: state.truncated,
  });

  process.stdout.write(values.json ? renderJson(report) : renderMarkdown(report));
  return exitCodeFor(policy.decision);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${formatCliError(error)}\n`);
    process.exitCode = 1;
  });

