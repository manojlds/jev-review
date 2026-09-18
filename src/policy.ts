export const SECURITY_NOUL_THRESHOLD = 0.7;
export const APPROVE_MERGE_THRESHOLD = 0.8;
export const HUMAN_REVIEW_APPROVE_MAX = 0.5;
/** Scores below this sit in the bottom two of five 0–4 levels. */
export const LOW_CORRECTNESS_MAX = 2;
export const HIGH_SCORE_CONFIDENCE = 0.6;
export const LOW_SCORE_CONFIDENCE = 0.5;
export const NOUL_UNCERTAIN_LOW = 0.35;
export const NOUL_UNCERTAIN_HIGH = 0.65;

export type Decision = 'approve' | 'request_changes' | 'escalate' | 'comment';

export interface ScoreAnswer {
  score: number;
  confidence: number;
}

export interface NoulAnswer {
  noul: number;
}

export interface ChoiceAnswer {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface ReviewAnswers {
  correctness: ScoreAnswer;
  test_gap: ScoreAnswer;
  security: ScoreAnswer;
  blast_radius: ScoreAnswer;
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

export function noulCertainty(value: number): number {
  return Math.max(value, 1 - value);
}

export function isUncertainNoul(value: number): boolean {
  return value > NOUL_UNCERTAIN_LOW && value < NOUL_UNCERTAIN_HIGH;
}

/**
 * Compose Jev's independent answers into one merge decision.
 * Hard safety gates run before approve; low confidence escalates instead of guessing.
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

  if (answers.correctness.score < LOW_CORRECTNESS_MAX) {
    return {
      decision: 'request_changes',
      rule: 'low_correctness',
      reasons: [
        `correctness=${formatScore(answers.correctness.score)} (bottom two of five levels, threshold ${LOW_CORRECTNESS_MAX})`,
      ],
    };
  }

  const minScoreConfidence = Math.min(
    answers.correctness.confidence,
    answers.test_gap.confidence,
    answers.security.confidence,
    answers.blast_radius.confidence
  );

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
        `min score confidence=${formatProb(minScoreConfidence)}`,
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

function uncertainReasons(answers: ReviewAnswers): string[] {
  const reasons: string[] = [];

  if (answers.correctness.confidence < LOW_SCORE_CONFIDENCE) {
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

  if (answers.test_gap.score < 3) {
    reasons.push(`test_gap=${formatScore(answers.test_gap.score)} (coverage gaps remain)`);
  }
  if (answers.blast_radius.score >= 3) {
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
