import { nearestLevel, SCORE_LEVELS } from './questions.js';
import {
  decide,
  noulCertainty,
  type Decision,
  type PolicyResult,
  type ReviewAnswers,
} from './policy.js';

export interface ReviewUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ReviewReport {
  decision: Decision;
  rule: string;
  reasons: string[];
  model: string;
  usage: ReviewUsage;
  task: string;
  source: string;
  files: string[];
  omitted: string[];
  truncated: boolean;
  scores: {
    correctness: ScoreView;
    test_gap: ScoreView;
    security: ScoreView;
    blast_radius: ScoreView;
  };
  nouls: {
    safe_to_merge: NoulView;
    needs_human_review: NoulView;
    has_security_concern: NoulView;
  };
  choices: {
    change_kind: ChoiceView;
    primary_risk: ChoiceView;
    review_focus: ChoiceView;
  };
}

interface ScoreView {
  score: number;
  confidence: number;
  nearestLevel: string;
  higherMeans: string;
}

interface NoulView {
  noul: number;
  certainty: number;
}

interface ChoiceView {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export function buildReport(options: {
  answers: ReviewAnswers;
  model: string;
  usage: ReviewUsage;
  task: string;
  source: string;
  files: string[];
  omitted?: string[];
  truncated: boolean;
  policy?: PolicyResult;
}): ReviewReport {
  const policy = options.policy ?? decide(options.answers);
  const { answers } = options;

  return {
    decision: policy.decision,
    rule: policy.rule,
    reasons: policy.reasons,
    model: options.model,
    usage: options.usage,
    task: options.task,
    source: options.source,
    files: options.files,
    omitted: options.omitted ?? [],
    truncated: options.truncated,
    scores: {
      correctness: scoreView(answers.correctness, SCORE_LEVELS.correctness, 'better correctness'),
      test_gap: scoreView(answers.test_gap, SCORE_LEVELS.test_gap, 'better test coverage'),
      security: scoreView(answers.security, SCORE_LEVELS.security, 'less new exposure'),
      blast_radius: scoreView(
        answers.blast_radius,
        SCORE_LEVELS.blast_radius,
        'larger impact elsewhere'
      ),
    },
    nouls: {
      safe_to_merge: noulView(answers.safe_to_merge.noul),
      needs_human_review: noulView(answers.needs_human_review.noul),
      has_security_concern: noulView(answers.has_security_concern.noul),
    },
    choices: {
      change_kind: choiceView(answers.change_kind),
      primary_risk: choiceView(answers.primary_risk),
      review_focus: choiceView(answers.review_focus),
    },
  };
}

export function renderMarkdown(report: ReviewReport): string {
  const files =
    report.files.length === 0
      ? '_none_'
      : report.files.map((file) => `\`${file}\``).join(', ');
  const omitted =
    report.omitted.length === 0
      ? ''
      : `\n- **Omitted:** ${report.omitted.map((file) => `\`${file}\``).join(', ')}`;
  const truncated = report.truncated ? '\n\nDiff was truncated to fit Jev\'s token budget.\n' : '\n';

  return `# Jev review

**Decision:** \`${report.decision}\`
**Rule:** \`${report.rule}\`
**Model:** ${report.model}

Jev produced typed decisions only. Diagnose causes in the diff before changing code.

## Why

${report.reasons.map((reason) => `- ${reason}`).join('\n')}

## Scores

| Dimension | Score (0–4) | Confidence | Higher means | Nearest level |
| --- | ---: | ---: | --- | --- |
${scoreRow('correctness', report.scores.correctness)}
${scoreRow('test_gap', report.scores.test_gap)}
${scoreRow('security', report.scores.security)}
${scoreRow('blast_radius', report.scores.blast_radius)}

## Gates

| Question | P(yes) | Certainty |
| --- | ---: | ---: |
${noulRow('safe_to_merge', report.nouls.safe_to_merge)}
${noulRow('needs_human_review', report.nouls.needs_human_review)}
${noulRow('has_security_concern', report.nouls.has_security_concern)}

## Classification

| Question | Choice | Confidence |
| --- | --- | ---: |
| change_kind | ${report.choices.change_kind.choice} | ${pct(report.choices.change_kind.confidence)} |
| primary_risk | ${report.choices.primary_risk.choice} | ${pct(report.choices.primary_risk.confidence)} |
| review_focus | ${report.choices.review_focus.choice} | ${pct(report.choices.review_focus.confidence)} |

## Context

- **Source:** ${report.source}
- **Task:** ${report.task}
- **Files:** ${files}${omitted}
- **Usage:** ${report.usage.inputTokens} input tokens, ${report.usage.outputTokens} output tokens
${truncated}`;
}

export function renderJson(report: ReviewReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function scoreView(
  answer: { score: number; confidence: number },
  levels: readonly string[],
  higherMeans: string
): ScoreView {
  return {
    score: round(answer.score, 1),
    confidence: round(answer.confidence, 2),
    nearestLevel: nearestLevel(answer.score, levels),
    higherMeans,
  };
}

function noulView(value: number): NoulView {
  return {
    noul: round(value, 2),
    certainty: round(noulCertainty(value), 2),
  };
}

function choiceView(answer: {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}): ChoiceView {
  const probabilities: Record<string, number> = {};
  for (const [key, probability] of Object.entries(answer.probabilities)) {
    probabilities[key] = round(probability, 3);
  }
  return {
    choice: answer.choice,
    confidence: round(answer.confidence, 2),
    probabilities,
  };
}

function scoreRow(name: string, view: ScoreView): string {
  return `| ${name} | ${view.score.toFixed(1)} | ${pct(view.confidence)} | ${view.higherMeans} | ${escapeCell(view.nearestLevel)} |`;
}

function noulRow(name: string, view: NoulView): string {
  return `| ${name} | ${view.noul.toFixed(2)} | ${pct(view.certainty)} |`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|');
}
