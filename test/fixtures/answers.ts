import type { ReviewAnswers } from '../src/policy.js';

const peaked = {
  bugfix: 0.04,
  feature: 0.02,
  refactor: 0.02,
  tests: 0.02,
  docs: 0.02,
  chore: 0.02,
  other: 0.02,
};

export const approveAnswers: ReviewAnswers = {
  correctness: { score: 3.6, confidence: 0.82 },
  test_gap: { score: 3.4, confidence: 0.74 },
  security: { score: 3.8, confidence: 0.88 },
  blast_radius: { score: 1.1, confidence: 0.8 },
  safe_to_merge: { noul: 0.91 },
  needs_human_review: { noul: 0.18 },
  has_security_concern: { noul: 0.06 },
  change_kind: {
    choice: 'bugfix',
    confidence: 0.79,
    probabilities: { ...peaked, bugfix: 0.86 },
  },
  primary_risk: {
    choice: 'none',
    confidence: 0.77,
    probabilities: {
      correctness: 0.08,
      security: 0.04,
      tests: 0.05,
      complexity: 0.04,
      none: 0.79,
    },
  },
  review_focus: {
    choice: 'none',
    confidence: 0.71,
    probabilities: {
      logic: 0.08,
      api_contract: 0.05,
      data: 0.05,
      concurrency: 0.04,
      error_handling: 0.05,
      none: 0.73,
    },
  },
};

export const securityAnswers: ReviewAnswers = {
  ...approveAnswers,
  has_security_concern: { noul: 0.84 },
  security: { score: 0.4, confidence: 0.9 },
  safe_to_merge: { noul: 0.12 },
  primary_risk: {
    choice: 'security',
    confidence: 0.86,
    probabilities: {
      correctness: 0.05,
      security: 0.88,
      tests: 0.03,
      complexity: 0.02,
      none: 0.02,
    },
  },
};

export const lowCorrectnessAnswers: ReviewAnswers = {
  ...approveAnswers,
  correctness: { score: 1.2, confidence: 0.81 },
  safe_to_merge: { noul: 0.22 },
  has_security_concern: { noul: 0.08 },
  primary_risk: {
    choice: 'correctness',
    confidence: 0.8,
    probabilities: {
      correctness: 0.82,
      security: 0.04,
      tests: 0.06,
      complexity: 0.05,
      none: 0.03,
    },
  },
};

export const lowConfidenceAnswers: ReviewAnswers = {
  ...approveAnswers,
  correctness: { score: 2.8, confidence: 0.41 },
  safe_to_merge: { noul: 0.52 },
  needs_human_review: { noul: 0.58 },
  has_security_concern: { noul: 0.47 },
  primary_risk: {
    choice: 'complexity',
    confidence: 0.38,
    probabilities: {
      correctness: 0.22,
      security: 0.18,
      tests: 0.2,
      complexity: 0.24,
      none: 0.16,
    },
  },
};

export const commentAnswers: ReviewAnswers = {
  correctness: { score: 3.1, confidence: 0.72 },
  test_gap: { score: 1.8, confidence: 0.7 },
  security: { score: 3.2, confidence: 0.68 },
  blast_radius: { score: 3.4, confidence: 0.66 },
  safe_to_merge: { noul: 0.72 },
  needs_human_review: { noul: 0.64 },
  has_security_concern: { noul: 0.11 },
  change_kind: {
    choice: 'feature',
    confidence: 0.7,
    probabilities: { ...peaked, feature: 0.84, bugfix: 0.06 },
  },
  primary_risk: {
    choice: 'tests',
    confidence: 0.69,
    probabilities: {
      correctness: 0.1,
      security: 0.05,
      tests: 0.72,
      complexity: 0.08,
      none: 0.05,
    },
  },
  review_focus: {
    choice: 'logic',
    confidence: 0.63,
    probabilities: {
      logic: 0.66,
      api_contract: 0.12,
      data: 0.08,
      concurrency: 0.05,
      error_handling: 0.06,
      none: 0.03,
    },
  },
};
