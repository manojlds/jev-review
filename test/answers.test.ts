import { describe, expect, it } from 'vitest';

import { applyMetric, toReviewAnswers } from '../src/answers.js';

const choice = {
  choice: 'docs',
  confidence: 0.8,
  probabilities: { docs: 0.8, other: 0.2 },
};

describe('applyMetric', () => {
  it('drops the score when applicability is below 0.5', () => {
    expect(applyMetric({ noul: 0.12 }, { score: 0, confidence: 1 })).toEqual({
      applicable: false,
      applicability: 0.12,
    });
  });

  it('keeps the score when applicability clears the threshold', () => {
    expect(applyMetric({ noul: 0.5 }, { score: 3.2, confidence: 0.7 })).toEqual({
      applicable: true,
      applicability: 0.5,
      score: 3.2,
      confidence: 0.7,
    });
  });
});

describe('toReviewAnswers', () => {
  it('pairs each score with its applicability noul', () => {
    const answers = toReviewAnswers({
      correctness_applicable: { noul: 0.9 },
      correctness: { score: 3.6, confidence: 0.8 },
      test_gap_applicable: { noul: 0.08 },
      test_gap: { score: 0, confidence: 1 },
      security_applicable: { noul: 0.2 },
      security: { score: 4, confidence: 0.9 },
      blast_radius_applicable: { noul: 0.7 },
      blast_radius: { score: 1.1, confidence: 0.75 },
      safe_to_merge: { noul: 0.91 },
      needs_human_review: { noul: 0.18 },
      has_security_concern: { noul: 0.06 },
      change_kind: choice,
      primary_risk: { ...choice, choice: 'none' },
      review_focus: { ...choice, choice: 'none' },
    });

    expect(answers.correctness).toMatchObject({ applicable: true, score: 3.6 });
    expect(answers.test_gap).toEqual({ applicable: false, applicability: 0.08 });
    expect(answers.security).toEqual({ applicable: false, applicability: 0.2 });
    expect(answers.blast_radius).toMatchObject({ applicable: true, score: 1.1 });
  });
});
