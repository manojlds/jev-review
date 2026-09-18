import { choice, noul, score } from '@typesafe-ai/sdk';

/**
 * Five-level rubrics, indexed 0–4. TypeSafe scores are a probability-weighted
 * mean of those indices and can land between levels.
 *
 * correctness, test_gap, and security: higher is better.
 * blast_radius: higher means more impact elsewhere.
 */
export const SCORE_LEVELS = {
  correctness: [
    'The change contradicts `task` or is clearly incorrect given `diff`.',
    'The change is likely wrong or incomplete in a way that should block merge.',
    'The change is plausibly correct but notable correctness risks remain.',
    'The change appears correct with limited, concrete residual risk.',
    'The change clearly implements `task` as shown in `diff`.',
  ],
  test_gap: [
    'No tests cover the behavior changed in `diff`.',
    'Tests exist but miss the main paths introduced or modified in `diff`.',
    'Core paths are covered; notable gaps remain around the change.',
    'The changed behavior is well covered by tests in `diff` or nearby files.',
    'Coverage of the change is thorough, including relevant edge cases.',
  ],
  security: [
    '`diff` introduces a concrete, exploitable security issue.',
    'Likely new exposure that should be fixed before merge.',
    'Some security risk; a reviewer should check the changed paths.',
    'No significant new security exposure is evident from `diff`.',
    'The change clearly does not introduce a security concern.',
  ],
  blast_radius: [
    'The change is isolated; other behavior is unlikely to break.',
    'Impact is mostly local with limited coupling.',
    'Moderate blast radius; some neighboring code could break.',
    'Wide coupling; several other areas could be affected.',
    'The change can break unrelated systems or a large surface area.',
  ],
} as const;

export const reviewQuestions = {
  correctness: score(
    'How correct is the implementation in `diff` relative to `task`? Judge only what the supplied state supports.',
    SCORE_LEVELS.correctness
  ),
  test_gap: score(
    'How well do tests in the supplied state cover the behavior changed in `diff`? Judge coverage quality, not whether tests were requested.',
    SCORE_LEVELS.test_gap
  ),
  security: score(
    'How secure is the change in `diff`? Higher means less new exposure. Do not invent issues that the state does not support.',
    SCORE_LEVELS.security
  ),
  blast_radius: score(
    'How much else can the change in `diff` break? Higher means a larger blast radius.',
    SCORE_LEVELS.blast_radius
  ),
  safe_to_merge: noul('Is the change in `diff` safe to merge as-is given `task`?', {
    true: 'No blocking correctness, security, or test gaps given the supplied state.',
    false: 'The change should not merge without further work.',
  }),
  needs_human_review: noul(
    'Should a person inspect `diff` before merge, given `task` and `files`?',
    {
      true: 'A human should look because of risk, ambiguity, or missing evidence.',
      false: 'The supplied state does not justify a mandatory human pass.',
    }
  ),
  has_security_concern: noul(
    'Does `diff` contain a concrete security issue, not a hypothetical one?',
    {
      true: 'The state shows a specific, evidenced security problem.',
      false: 'No concrete security issue is evidenced by the state.',
    }
  ),
  change_kind: choice('What kind of change is `diff`?', {
    bugfix: 'Fixes incorrect existing behavior.',
    feature: 'Adds user-facing or API behavior that did not exist.',
    refactor: 'Restructures code without intending to change behavior.',
    tests: 'Primarily adds or updates tests.',
    docs: 'Primarily documentation or comments.',
    chore: 'Build, CI, deps, or other maintenance.',
    other: 'None of the listed kinds fit.',
  }),
  primary_risk: choice(
    'What is the single most consequential risk evidenced by `diff`? Choose none when no listed risk is justified.',
    {
      correctness: 'The change may be wrong or incomplete relative to `task`.',
      security: 'The change may introduce a security issue.',
      tests: 'Tests do not adequately cover the change.',
      complexity: 'The change is hard to follow, extend, or contain.',
      none: 'No listed risk is justified by the supplied state.',
    }
  ),
  review_focus: choice(
    'If a person reviews `diff`, what should they look at first? Choose none when a focused review is unnecessary.',
    {
      logic: 'Control flow, edge cases, or business rules.',
      api_contract: 'Public types, endpoints, or compatibility.',
      data: 'Persistence, migrations, or data integrity.',
      concurrency: 'Races, shared state, or async ordering.',
      error_handling: 'Failures, retries, or missing error paths.',
      none: 'No particular focus is warranted from the supplied state.',
    }
  ),
};

export type ReviewQuestions = typeof reviewQuestions;

export function nearestLevel(scoreValue: number, levels: readonly string[]): string {
  const index = Math.min(levels.length - 1, Math.max(0, Math.round(scoreValue)));
  return levels[index] ?? levels[0]!;
}
