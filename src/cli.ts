#!/usr/bin/env node
import { parseArgs } from 'node:util';

import { toReviewAnswers, usageFrom } from './answers.js';
import { evaluateReview } from './client.js';
import { formatCliError } from './errors.js';
import { collectChange, reviewTaskFromChange } from './git.js';
import { writeReportFile } from './output.js';
import { planReview } from './pack.js';
import { combineSlicePolicies, decide, exitCodeFor } from './policy.js';
import { buildReport, renderJson, renderMarkdown } from './render.js';
import { buildReviewState } from './state.js';

const HELP = `jev-review — typed TypeSafe Jev decisions over a local git diff

Usage:
  jev-review [--base <ref>] [--task <text>] [--output <file>]
  jev-review --commit <rev|range> [--task <text>] [--output <file>]
  jev-review --diff <file.patch> [--task <text>] [--output <file>] [--json]

Options:
  --base <ref>   Diff the working tree against this ref (default: HEAD, or the
                 working tree if this repo has no commits yet)
  --commit <rev|range>
                 Review a commit (HEAD, abc123) or range (main..HEAD, main...HEAD)
                 without the working tree
  --diff <file>  Review a patch file instead of a git range
  --task <text>  What the change is supposed to do. Local git reviews default to
                 the commit message(s) in the reviewed range
  --config <path>
                 jev-review.config.json (default: ./jev-review.config.json)
  --output <file>
                 Write the report to a file (markdown, or JSON with --json)
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
      commit: { type: 'string' },
      diff: { type: 'string' },
      task: { type: 'string' },
      config: { type: 'string' },
      output: { type: 'string' },
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
    commit: values.commit,
    diffFile: values.diff,
    configPath: values.config,
  });
  const reviewTask = reviewTaskFromChange(change, values.task);

  if (change.skipped.length > 0) {
    process.stderr.write(
      `Ignoring ${change.skipped.length} file(s): ${change.skipped.join(', ')}\n`
    );
  }

  if (!change.diff.trim()) {
    process.stderr.write('No changes to review.\n');
    return 0;
  }

  if (!values.task && reviewTask.task) {
    process.stderr.write('Using git commit messages as the review task.\n');
  }

  const plan = planReview(change.diff, change.files);
  const dropped = plan.omitted.filter((file) => !change.skipped.includes(file));
  if (dropped.length > 0) {
    process.stderr.write(
      `Truncated ${dropped.length} file(s) that exceeded Jev's token budget: ${dropped.join(', ')}\n`
    );
  }
  if (plan.batches.length > 1) {
    process.stderr.write(
      `Splitting into ${plan.batches.length} Jev slices (source files kept with their tests).\n`
    );
  }

  const slices = [];
  let clippedTask = reviewTask.task ?? '';
  let clippedCommitMessages = reviewTask.commitMessages;
  for (const [index, batch] of plan.batches.entries()) {
    const state = buildReviewState({
      task: reviewTask.task,
      taskOrigin: reviewTask.origin,
      commitMessages: reviewTask.commitMessages,
      source: change.source,
      files: batch.files,
      omitted: [...change.skipped, ...plan.omitted],
      diff: batch.diff,
    });
    if (index === 0) {
      clippedTask = state.task;
      clippedCommitMessages = state.commitMessages;
    }

    process.stderr.write(
      `Evaluating slice ${index + 1}/${plan.batches.length}: ${
        state.files.join(', ') || 'unlisted'
      } from ${state.source}…\n`
    );

    const result = await evaluateReview(state);
    const answers = toReviewAnswers(result.answers);
    slices.push({
      files: batch.files,
      answers,
      policy: decide(answers),
      model: result.model,
      usage: usageFrom(result),
      truncated: state.truncated || batch.truncated,
    });
  }

  const first = slices[0];
  if (!first) {
    process.stderr.write('No changes to review.\n');
    return 0;
  }

  const policy = combineSlicePolicies(slices);
  const report = buildReport({
    answers: first.answers,
    policy,
    slices,
    model: uniqueModels(slices.map((slice) => slice.model)),
    usage: {
      inputTokens: slices.reduce((sum, slice) => sum + slice.usage.inputTokens, 0),
      outputTokens: slices.reduce((sum, slice) => sum + slice.usage.outputTokens, 0),
    },
    task: clippedTask,
    taskOrigin: reviewTask.origin,
    commitMessages: clippedCommitMessages,
    source: change.source,
    files: plan.batches.flatMap((batch) => batch.files),
    omitted: [...change.skipped, ...plan.omitted],
    truncated: slices.some((slice) => slice.truncated) || plan.omitted.length > 0,
  });

  const rendered = values.json ? renderJson(report) : renderMarkdown(report);
  if (values.output) {
    writeReportFile(values.output, rendered);
    process.stderr.write(`Wrote ${values.output}\n`);
  }
  process.stdout.write(rendered);
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

function uniqueModels(models: string[]): string {
  return [...new Set(models)].join(', ');
}

