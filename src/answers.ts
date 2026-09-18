import type { ReviewAnswers } from './policy.js';

export function toReviewAnswers(answers: {
  correctness: ReviewAnswers['correctness'];
  test_gap: ReviewAnswers['test_gap'];
  security: ReviewAnswers['security'];
  blast_radius: ReviewAnswers['blast_radius'];
  safe_to_merge: ReviewAnswers['safe_to_merge'];
  needs_human_review: ReviewAnswers['needs_human_review'];
  has_security_concern: ReviewAnswers['has_security_concern'];
  change_kind: ReviewAnswers['change_kind'];
  primary_risk: ReviewAnswers['primary_risk'];
  review_focus: ReviewAnswers['review_focus'];
}): ReviewAnswers {
  return {
    correctness: pickScore(answers.correctness),
    test_gap: pickScore(answers.test_gap),
    security: pickScore(answers.security),
    blast_radius: pickScore(answers.blast_radius),
    safe_to_merge: { noul: answers.safe_to_merge.noul },
    needs_human_review: { noul: answers.needs_human_review.noul },
    has_security_concern: { noul: answers.has_security_concern.noul },
    change_kind: pickChoice(answers.change_kind),
    primary_risk: pickChoice(answers.primary_risk),
    review_focus: pickChoice(answers.review_focus),
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

function pickScore(answer: ReviewAnswers['correctness']): ReviewAnswers['correctness'] {
  return { score: answer.score, confidence: answer.confidence };
}

function pickChoice(answer: ReviewAnswers['change_kind']): ReviewAnswers['change_kind'] {
  return {
    choice: answer.choice,
    confidence: answer.confidence,
    probabilities: { ...answer.probabilities },
  };
}
