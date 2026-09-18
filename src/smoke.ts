#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { toReviewAnswers, usageFrom } from './answers.js';
import { evaluateReview, hasApiKey } from './client.js';
import { sanitizeError } from './errors.js';
import { parseDiffFiles } from './git.js';
import { decide } from './policy.js';
import { buildReport, renderMarkdown } from './render.js';
import { buildReviewState } from './state.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = join(root, 'test/fixtures/synthetic.diff');
const outputDir = join(root, 'fixtures/live');

async function main(): Promise<void> {
  if (!hasApiKey()) {
    process.stderr.write(
      'Skipping live smoke: set TYPESAFE_API_KEY or JEV_API_KEY.\nOffline tests still run with `pnpm test`.\n'
    );
    return;
  }

  const diff = readFileSync(fixturePath, 'utf8');
  const state = buildReviewState({
    task: 'Authenticate users without storing or querying plaintext passwords.',
    source: 'file:test/fixtures/synthetic.diff',
    files: parseDiffFiles(diff),
    diff,
  });

  process.stderr.write('Running live Jev smoke against the synthetic login diff…\n');
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
    truncated: state.truncated,
  });

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(renderMarkdown(report));
  process.stderr.write(`Wrote ${join(outputDir, 'smoke.json')} (gitignored).\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${sanitizeError(message)}\n`);
  process.exitCode = 1;
});
