import type { MetricEvaluation, ReviewAnswers } from '../../src/policy.js';

const peaked = {
  bugfix: 0.04,
  feature: 0.02,
  refactor: 0.02,
  tests: 0.02,
  docs: 0.02,
  chore: 0.02,
  other: 0.02,
};

function scored(
  score: number,
  confidence: number,
  applicability = 0.92
): Extract<MetricEvaluation, { applicable: true }> {
  return { applicable: true, applicability, score, confidence };
}

function notApplicable(applicability = 0.12): Extract<MetricEvaluation, { applicable: false }> {
  return { applicable: false, applicability };
}

function weaknessChoice(
  choice: string,
  probabilities: Record<string, number>,
  confidence = 0.8
): ReviewAnswers['reliability_weakness'] {
  return { choice, confidence, probabilities };
}

const reliabilityNone = weaknessChoice('no_material_issue', {
  no_material_issue: 0.82,
  error_propagation: 0.06,
  cleanup: 0.04,
  timeout_retry: 0.04,
  concurrency: 0.04,
});

const changeabilityNone = weaknessChoice('no_material_issue', {
  no_material_issue: 0.81,
  scattered_rule: 0.06,
  shotgun_surgery: 0.05,
  brittle_chain: 0.04,
  hidden_dependency: 0.04,
});

const compatibilityNone = weaknessChoice('no_material_issue', {
  no_material_issue: 0.84,
  breaking_change: 0.05,
  migration_gap: 0.04,
  version_assumption: 0.04,
  interoperability: 0.03,
});

export const approveAnswers: ReviewAnswers = {
  correctness: scored(3.6, 0.82),
  test_gap: scored(3.4, 0.74),
  security: scored(3.8, 0.88),
  blast_radius: scored(1.1, 0.8),
  reliability: scored(3.5, 0.8),
  changeability: scored(3.3, 0.78),
  compatibility: scored(3.7, 0.74),
  reliability_weakness: reliabilityNone,
  changeability_weakness: changeabilityNone,
  compatibility_weakness: compatibilityNone,
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
  security: scored(0.4, 0.9),
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
  correctness: scored(1.2, 0.81),
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
  correctness: scored(2.8, 0.41),
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
  correctness: scored(3.1, 0.72),
  test_gap: scored(1.8, 0.7),
  security: scored(3.2, 0.68),
  blast_radius: scored(3.4, 0.66),
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
  reliability: scored(1.9, 0.71),
  changeability: scored(1.5, 0.68),
  compatibility: scored(2.4, 0.66),
  reliability_weakness: weaknessChoice(
    'error_propagation',
    {
      no_material_issue: 0.08,
      error_propagation: 0.72,
      cleanup: 0.08,
      timeout_retry: 0.07,
      concurrency: 0.05,
    },
    0.7
  ),
  changeability_weakness: weaknessChoice(
    'shotgun_surgery',
    {
      no_material_issue: 0.07,
      scattered_rule: 0.14,
      shotgun_surgery: 0.68,
      brittle_chain: 0.07,
      hidden_dependency: 0.04,
    },
    0.67
  ),
  compatibility_weakness: compatibilityNone,
};

/** Docs/CLI-style change: coverage is not assessable, so a 0 score must not count. */
export const docsAnswers: ReviewAnswers = {
  ...approveAnswers,
  test_gap: notApplicable(0.08),
  reliability: notApplicable(0.14),
  changeability: notApplicable(0.16),
  compatibility: notApplicable(0.1),
  change_kind: {
    choice: 'docs',
    confidence: 0.84,
    probabilities: { ...peaked, docs: 0.88, bugfix: 0.02 },
  },
  primary_risk: {
    choice: 'none',
    confidence: 0.8,
    probabilities: {
      correctness: 0.05,
      security: 0.04,
      tests: 0.06,
      complexity: 0.04,
      none: 0.81,
    },
  },
};
