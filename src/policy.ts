export const SECURITY_NOUL_THRESHOLD = 0.7;
export const APPROVE_MERGE_THRESHOLD = 0.8;
export const HUMAN_REVIEW_APPROVE_MAX = 0.5;
/** Scores below this sit in the bottom two of five 0–4 levels. */
export const LOW_CORRECTNESS_MAX = 2;
export const HIGH_SCORE_CONFIDENCE = 0.6;
export const LOW_SCORE_CONFIDENCE = 0.5;
export const NOUL_UNCERTAIN_LOW = 0.35;
export const NOUL_UNCERTAIN_HIGH = 0.65;
/** Applicability noul below this means the score is not used. */
export const APPLICABLE_THRESHOLD = 0.5;

export type Decision = 'approve' | 'request_changes' | 'escalate' | 'comment';

export type MetricEvaluation =
  | { applicable: false; applicability: number }
  | { applicable: true; applicability: number; score: number; confidence: number };

export interface NoulAnswer {
  noul: number;
}

export interface ChoiceAnswer {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface ReviewAnswers {
  correctness: MetricEvaluation;
  test_gap: MetricEvaluation;
  security: MetricEvaluation;
  blast_radius: MetricEvaluation;
  safe_to_merge: NoulAnswer;
  needs_human_review: NoulAnswer;
  has_security_concern: NoulAnswer;
  change_kind: ChoiceAnswer;
  primary_risk: ChoiceAnswer;
  review_focus: ChoiceAnswer;
}

export interface PolicyResult {
  decision: Decision;
  rule: string;
  reasons: string[];
}

export function isScored(
  metric: MetricEvaluation
): metric is Extract<MetricEvaluation, { applicable: true }> {
  return metric.applicable;
}

export function noulCertainty(value: number): number {
  return Math.max(value, 1 - value);
}

export function isUncertainNoul(value: number): boolean {
  return value > NOUL_UNCERTAIN_LOW && value < NOUL_UNCERTAIN_HIGH;
}

/**
 * Compose Jev's independent answers into one merge decision.
 * Hard safety gates run before approve; low confidence escalates instead of guessing.
 * Inapplicable scores are ignored — missing evidence is not a zero.
 */
export function decide(answers: ReviewAnswers): PolicyResult {
  if (answers.has_security_concern.noul >= SECURITY_NOUL_THRESHOLD) {
    return {
      decision: 'request_changes',
      rule: 'security_concern',
      reasons: [
        `has_security_concern=${formatProb(answers.has_security_concern.noul)} (>= ${SECURITY_NOUL_THRESHOLD})`,
      ],
    };
  }

  if (isScored(answers.correctness) && answers.correctness.score < LOW_CORRECTNESS_MAX) {
    return {
      decision: 'request_changes',
      rule: 'low_correctness',
      reasons: [
        `correctness=${formatScore(answers.correctness.score)} (bottom two of five levels, threshold ${LOW_CORRECTNESS_MAX})`,
      ],
    };
  }

  const scoreConfidences = scoredConfidences(answers);
  const minScoreConfidence =
    scoreConfidences.length === 0 ? 1 : Math.min(...scoreConfidences);

  if (
    answers.safe_to_merge.noul >= APPROVE_MERGE_THRESHOLD &&
    minScoreConfidence >= HIGH_SCORE_CONFIDENCE &&
    answers.needs_human_review.noul < HUMAN_REVIEW_APPROVE_MAX
  ) {
    return {
      decision: 'approve',
      rule: 'safe_to_merge',
      reasons: [
        `safe_to_merge=${formatProb(answers.safe_to_merge.noul)}`,
        `min applicable score confidence=${formatProb(minScoreConfidence)}`,
        `needs_human_review=${formatProb(answers.needs_human_review.noul)}`,
      ],
    };
  }

  const uncertain = uncertainReasons(answers);
  if (uncertain.length > 0) {
    return {
      decision: 'escalate',
      rule: 'low_confidence',
      reasons: uncertain,
    };
  }

  return {
    decision: 'comment',
    rule: 'mergeable_with_caveats',
    reasons: commentReasons(answers),
  };
}

const DECISION_RANK: Record<Decision, number> = {
  request_changes: 0,
  escalate: 1,
  comment: 2,
  approve: 3,
};

/**
 * Conservative merge of per-slice decisions. A block or escalate in any slice
 * wins; approve only if every slice would approve. Scores are not averaged.
 */
export function combineSlicePolicies(
  slices: Array<{ files: string[]; policy: PolicyResult }>
): PolicyResult {
  if (slices.length === 0) {
    throw new Error('No review slices to combine.');
  }
  if (slices.length === 1) {
    return slices[0]!.policy;
  }

  const worstRank = Math.min(...slices.map((slice) => DECISION_RANK[slice.policy.decision]));
  const decision = (Object.keys(DECISION_RANK) as Decision[]).find(
    (key) => DECISION_RANK[key] === worstRank
  )!;
  const matching = slices.filter((slice) => slice.policy.decision === decision);

  if (decision === 'approve') {
    return {
      decision: 'approve',
      rule: 'all_slices_safe_to_merge',
      reasons: [`all ${slices.length} slices approved`],
    };
  }

  const rule =
    decision === 'request_changes'
      ? 'any_slice_request_changes'
      : decision === 'escalate'
        ? 'any_slice_escalate'
        : 'any_slice_comment';

  return {
    decision,
    rule,
    reasons: matching.flatMap((slice) =>
      slice.policy.reasons.map((reason) => `${sliceLabel(slice.files)}: ${reason}`)
    ),
  };
}

function sliceLabel(files: string[]): string {
  if (files.length === 0) return '(unlisted)';
  if (files.length <= 2) return files.join(', ');
  return `${files[0]} +${files.length - 1}`;
}

export function exitCodeFor(decision: Decision): number {
  switch (decision) {
    case 'approve':
    case 'comment':
      return 0;
    case 'request_changes':
      return 1;
    case 'escalate':
      return 2;
  }
}

function scoredConfidences(answers: ReviewAnswers): number[] {
  return [answers.correctness, answers.test_gap, answers.security, answers.blast_radius]
    .filter(isScored)
    .map((metric) => metric.confidence);
}

function uncertainReasons(answers: ReviewAnswers): string[] {
  const reasons: string[] = [];

  if (isScored(answers.correctness) && answers.correctness.confidence < LOW_SCORE_CONFIDENCE) {
    reasons.push(
      `correctness confidence=${formatProb(answers.correctness.confidence)} (< ${LOW_SCORE_CONFIDENCE})`
    );
  }
  if (isUncertainNoul(answers.safe_to_merge.noul)) {
    reasons.push(`safe_to_merge=${formatProb(answers.safe_to_merge.noul)} is near 0.5`);
  }
  if (isUncertainNoul(answers.has_security_concern.noul)) {
    reasons.push(
      `has_security_concern=${formatProb(answers.has_security_concern.noul)} is near 0.5`
    );
  }
  if (answers.primary_risk.confidence < LOW_SCORE_CONFIDENCE) {
    reasons.push(
      `primary_risk confidence=${formatProb(answers.primary_risk.confidence)} (< ${LOW_SCORE_CONFIDENCE})`
    );
  }

  return reasons;
}

function commentReasons(answers: ReviewAnswers): string[] {
  const reasons = [
    `safe_to_merge=${formatProb(answers.safe_to_merge.noul)}`,
    `needs_human_review=${formatProb(answers.needs_human_review.noul)}`,
    `primary_risk=${answers.primary_risk.choice}`,
  ];

  if (isScored(answers.test_gap) && answers.test_gap.score < 3) {
    reasons.push(`test_gap=${formatScore(answers.test_gap.score)} (coverage gaps remain)`);
  }
  if (isScored(answers.blast_radius) && answers.blast_radius.score >= 3) {
    reasons.push(`blast_radius=${formatScore(answers.blast_radius.score)} (wide impact)`);
  }

  return reasons;
}

function formatProb(value: number): string {
  return value.toFixed(2);
}

function formatScore(value: number): string {
  return value.toFixed(1);
}
