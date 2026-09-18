import { nearestLevel, SCORE_LEVELS } from './questions.js';
import {
  decide,
  isScored,
  noulCertainty,
  type Decision,
  type MetricEvaluation,
  type PolicyResult,
  type ReviewAnswers,
} from './policy.js';
import type { TaskOrigin } from './git.js';

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
  taskOrigin: TaskOrigin;
  commitMessages?: string;
  source: string;
  files: string[];
  omitted: string[];
  truncated: boolean;
  scores: {
    correctness: ScoreView;
    test_gap: ScoreView;
    security: ScoreView;
    blast_radius: ScoreView;
    reliability: ScoreView;
    changeability: ScoreView;
    compatibility: ScoreView;
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
    reliability_weakness: ChoiceView;
    changeability_weakness: ChoiceView;
    compatibility_weakness: ChoiceView;
  };
  slices?: SliceReport[];
}

export interface SliceReport {
  files: string[];
  decision: Decision;
  rule: string;
  reasons: string[];
  scores: ReviewReport['scores'];
  nouls: ReviewReport['nouls'];
  choices: ReviewReport['choices'];
}

type ScoreView =
  | {
      applicable: false;
      applicability: number;
      higherMeans: string;
    }
  | {
      applicable: true;
      applicability: number;
      score: number;
      confidence: number;
      nearestLevel: string;
      higherMeans: string;
    };

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
  taskOrigin?: TaskOrigin;
  commitMessages?: string;
  source: string;
  files: string[];
  omitted?: string[];
  truncated: boolean;
  policy?: PolicyResult;
  slices?: Array<{ files: string[]; answers: ReviewAnswers; policy: PolicyResult }>;
}): ReviewReport {
  const policy = options.policy ?? decide(options.answers);
  const { answers } = options;
  const scorecard = scorecardFromAnswers(answers);

  return {
    decision: policy.decision,
    rule: policy.rule,
    reasons: policy.reasons,
    model: options.model,
    usage: options.usage,
    task: options.task,
    taskOrigin: options.taskOrigin ?? 'fallback',
    commitMessages: options.commitMessages,
    source: options.source,
    files: options.files,
    omitted: options.omitted ?? [],
    truncated: options.truncated,
    ...scorecard,
    slices:
      options.slices && options.slices.length > 1
        ? options.slices.map((slice) => ({
            files: slice.files,
            decision: slice.policy.decision,
            rule: slice.policy.rule,
            reasons: slice.policy.reasons,
            ...scorecardFromAnswers(slice.answers),
          }))
        : undefined,
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
  const sliceCount =
    report.slices && report.slices.length > 1
      ? `\n- **Slices:** ${report.slices.length} Jev calls (source files kept with their tests)`
      : '';

  return `# Jev review

**Decision:** \`${report.decision}\`
**Rule:** \`${report.rule}\`
**Model:** ${report.model}

## Task

${taskOriginLine(report.taskOrigin)}

${escapeForMarkdown(report.task)}
${report.commitMessages ? `\nGit commit message(s) also sent:\n\n${escapeForMarkdown(report.commitMessages)}\n` : ''}
Jev produced typed decisions only. Diagnose causes in the diff before changing code.

## Why

${report.reasons.map((reason) => `- ${escapeForMarkdown(reason)}`).join('\n')}
${renderScorecards(report)}
## Context

- **Source:** ${report.source}
- **Files:** ${files}${omitted}${sliceCount}
- **Usage:** ${report.usage.inputTokens} input tokens, ${report.usage.outputTokens} output tokens
${truncated}`;
}

export function renderJson(report: ReviewReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function scorecardFromAnswers(answers: ReviewAnswers): Pick<ReviewReport, 'scores' | 'nouls' | 'choices'> {
  return {
    scores: {
      correctness: scoreView(answers.correctness, SCORE_LEVELS.correctness, 'better correctness'),
      test_gap: scoreView(answers.test_gap, SCORE_LEVELS.test_gap, 'better test coverage'),
      security: scoreView(answers.security, SCORE_LEVELS.security, 'less new exposure'),
      blast_radius: scoreView(
        answers.blast_radius,
        SCORE_LEVELS.blast_radius,
        'larger impact elsewhere'
      ),
      reliability: scoreView(answers.reliability, SCORE_LEVELS.reliability, 'more reliable failure handling'),
      changeability: scoreView(
        answers.changeability,
        SCORE_LEVELS.changeability,
        'easier next edit'
      ),
      compatibility: scoreView(
        answers.compatibility,
        SCORE_LEVELS.compatibility,
        'more contract-stable'
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
      reliability_weakness: choiceView(answers.reliability_weakness),
      changeability_weakness: choiceView(answers.changeability_weakness),
      compatibility_weakness: choiceView(answers.compatibility_weakness),
    },
  };
}

function renderScorecards(report: ReviewReport): string {
  if (report.slices && report.slices.length > 1) {
    const sections = report.slices.map((slice, index) => {
      const names =
        slice.files.length === 0 ? '_unlisted_' : slice.files.map((file) => `\`${file}\``).join(', ');
      return `### Slice ${index + 1}: ${names} — \`${slice.decision}\`

${slice.reasons.map((reason) => `- ${escapeForMarkdown(reason)}`).join('\n')}

${scorecardTables(slice)}`;
    });
    return `\n## Slices\n\n${sections.join('\n')}\n`;
  }

  return `\n## Scores

${scorecardTables(report)}
`;
}

function scorecardTables(view: Pick<ReviewReport, 'scores' | 'nouls' | 'choices'>): string {
  return `| Dimension | Score (0–4) | Confidence | Higher means | Nearest level |
| --- | ---: | ---: | --- | --- |
${scoreRow('correctness', view.scores.correctness)}
${scoreRow('test_gap', view.scores.test_gap)}
${scoreRow('security', view.scores.security)}
${scoreRow('blast_radius', view.scores.blast_radius)}
${scoreRow('reliability', view.scores.reliability)}
${scoreRow('changeability', view.scores.changeability)}
${scoreRow('compatibility', view.scores.compatibility)}

## Gates

| Question | P(yes) | Certainty |
| --- | ---: | ---: |
${noulRow('safe_to_merge', view.nouls.safe_to_merge)}
${noulRow('needs_human_review', view.nouls.needs_human_review)}
${noulRow('has_security_concern', view.nouls.has_security_concern)}

## Classification

| Question | Choice | Confidence |
| --- | --- | ---: |
| change_kind | ${view.choices.change_kind.choice} | ${pct(view.choices.change_kind.confidence)} |
| primary_risk | ${view.choices.primary_risk.choice} | ${pct(view.choices.primary_risk.confidence)} |
| review_focus | ${view.choices.review_focus.choice} | ${pct(view.choices.review_focus.confidence)} |

## Weaknesses

| Dimension | Weakness | Confidence |
| --- | --- | ---: |
${weaknessRow('reliability', view.scores.reliability, view.choices.reliability_weakness)}
${weaknessRow('changeability', view.scores.changeability, view.choices.changeability_weakness)}
${weaknessRow('compatibility', view.scores.compatibility, view.choices.compatibility_weakness)} |`;
}

function scoreView(
  answer: MetricEvaluation,
  levels: readonly string[],
  higherMeans: string
): ScoreView {
  if (!isScored(answer)) {
    return {
      applicable: false,
      applicability: round(answer.applicability, 2),
      higherMeans,
    };
  }
  return {
    applicable: true,
    applicability: round(answer.applicability, 2),
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
  if (!view.applicable) {
    return `| ${name} | n/a | — | ${view.higherMeans} | not assessable from this state |`;
  }
  return `| ${name} | ${view.score.toFixed(1)} | ${pct(view.confidence)} | ${view.higherMeans} | ${escapeCell(view.nearestLevel)} |`;
}

function noulRow(name: string, view: NoulView): string {
  return `| ${name} | ${view.noul.toFixed(2)} | ${pct(view.certainty)} |`;
}

function weaknessRow(name: string, score: ScoreView, view: ChoiceView): string {
  if (!score.applicable) {
    return `| ${name} | n/a | — |`;
  }
  return `| ${name} | ${view.choice} | ${pct(view.confidence)} |`;
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

function taskOriginLine(origin: TaskOrigin): string {
  switch (origin) {
    case 'git':
      return '_Captured from git commit messages._';
    case 'cli':
      return '_Captured from `--task`._';
    case 'fallback':
      return '_Generic fallback (no `--task` and no git commit messages)._';
  }
}

/** Raw `<` / `>` make Cursor/VS Code preview treat the rest of the file as HTML. */
function escapeForMarkdown(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
