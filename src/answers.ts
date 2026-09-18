import {
  APPLICABLE_THRESHOLD,
  type MetricEvaluation,
  type ReviewAnswers,
} from './policy.js';

interface SdkScore {
  score: number;
  confidence: number;
}

interface SdkNoul {
  noul: number;
}

interface SdkChoice {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export function toReviewAnswers(answers: {
  correctness_applicable: SdkNoul;
  correctness: SdkScore;
  test_gap_applicable: SdkNoul;
  test_gap: SdkScore;
  security_applicable: SdkNoul;
  security: SdkScore;
  blast_radius_applicable: SdkNoul;
  blast_radius: SdkScore;
  reliability_applicable: SdkNoul;
  reliability: SdkScore;
  reliability_weakness: SdkChoice;
  changeability_applicable: SdkNoul;
  changeability: SdkScore;
  changeability_weakness: SdkChoice;
  compatibility_applicable: SdkNoul;
  compatibility: SdkScore;
  compatibility_weakness: SdkChoice;
  safe_to_merge: SdkNoul;
  needs_human_review: SdkNoul;
  has_security_concern: SdkNoul;
  change_kind: SdkChoice;
  primary_risk: SdkChoice;
  review_focus: SdkChoice;
}): ReviewAnswers {
  return {
    correctness: applyMetric(answers.correctness_applicable, answers.correctness),
    test_gap: applyMetric(answers.test_gap_applicable, answers.test_gap),
    security: applyMetric(answers.security_applicable, answers.security),
    blast_radius: applyMetric(answers.blast_radius_applicable, answers.blast_radius),
    reliability: applyMetric(answers.reliability_applicable, answers.reliability),
    changeability: applyMetric(answers.changeability_applicable, answers.changeability),
    compatibility: applyMetric(answers.compatibility_applicable, answers.compatibility),
    safe_to_merge: { noul: answers.safe_to_merge.noul },
    needs_human_review: { noul: answers.needs_human_review.noul },
    has_security_concern: { noul: answers.has_security_concern.noul },
    change_kind: pickChoice(answers.change_kind),
    primary_risk: pickChoice(answers.primary_risk),
    review_focus: pickChoice(answers.review_focus),
    reliability_weakness: pickChoice(answers.reliability_weakness),
    changeability_weakness: pickChoice(answers.changeability_weakness),
    compatibility_weakness: pickChoice(answers.compatibility_weakness),
  };
}

export function usageFrom(result: { usage: { input_tokens: number; output_tokens: number } }): {
  inputTokens: number;
  outputTokens: number;
} {
  return {
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
  };
}

/**
 * Speculative fan-out: Jev still answers every score. Policy uses the score
 * only when the paired applicability noul clears the threshold.
 */
export function applyMetric(applicable: SdkNoul, scored: SdkScore): MetricEvaluation {
  if (applicable.noul < APPLICABLE_THRESHOLD) {
    return { applicable: false, applicability: applicable.noul };
  }
  return {
    applicable: true,
    applicability: applicable.noul,
    score: scored.score,
    confidence: scored.confidence,
  };
}

function pickChoice(answer: SdkChoice): ReviewAnswers['change_kind'] {
  return {
    choice: answer.choice,
    confidence: answer.confidence,
    probabilities: { ...answer.probabilities },
  };
}
