import { choice, noul, score } from '@typesafe-ai/sdk';

/**
 * Five-level rubrics, indexed 0–4. TypeSafe scores are a probability-weighted
 * mean of those indices and can land between levels.
 *
 * correctness, test_gap, security, reliability, changeability, compatibility:
 * higher is better. blast_radius: higher means more impact elsewhere.
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
  reliability: [
    'Failure paths are unhandled; errors are swallowed or state is left inconsistent.',
    'Important failure paths are missing or unsafe given `diff`.',
    'The success path looks fine; notable error-handling gaps remain.',
    'Credible failures are handled with limited residual risk.',
    'Error propagation, cleanup, and recovery look deliberate for this change.',
  ],
  changeability: [
    'A small conceptual change would require shotgun edits across unrelated modules.',
    'Domain rules are scattered; the next edit has a large, unpredictable surface.',
    'Moderate change amplification; some knowledge is duplicated or chained.',
    'The next conceptual change has a mostly predictable, local edit surface.',
    'Knowledge is centralized; a conceptual change would touch a small, obvious place.',
  ],
  compatibility: [
    'The change breaks an existing public or integration contract without a migration.',
    'Likely breaking change or missing compatibility path.',
    'Contract risk remains; a reviewer should check APIs or migrations.',
    'Affected contracts appear preserved with limited residual compatibility risk.',
    'Backwards compatibility is clearly preserved, or an explicit tested migration exists.',
  ],
} as const;

function applicable(label: string, extra: string) {
  return noul(
    `Is ${label} relevant and assessable from the supplied state? Answer yes only when \`diff\` contains concrete evidence for this dimension. Do not invent concerns. ${extra}`,
    {
      true: `The supplied state supports a defensible ${label} assessment.`,
      false: `${label} is irrelevant here, or the state is too thin to score.`,
    }
  );
}

function weakness(label: string, criteria: Record<string, string>) {
  return choice(
    `Identify the single most consequential ${label} weakness evidenced by \`diff\`. Choose no_material_issue when no listed concern is justified. Do not speculate beyond the state.`,
    {
      no_material_issue: 'No material issue is evident from the supplied state.',
      ...criteria,
    }
  );
}

export const reviewQuestions = {
  correctness_applicable: applicable(
    'correctness',
    'Answer no for docs-only, lockfile, or empty changes with no implementation to judge against `task`.'
  ),
  correctness: score(
    'How correct is the implementation in `diff` relative to `task`? Judge only what the supplied state supports.',
    SCORE_LEVELS.correctness
  ),
  test_gap_applicable: applicable(
    'test coverage',
    'Answer no when `diff` has no tests and no behavioral code whose coverage can be judged (docs, comments, config, chore).'
  ),
  test_gap: score(
    'How well do tests in the supplied state cover the behavior changed in `diff`? Judge coverage quality, not whether tests were requested.',
    SCORE_LEVELS.test_gap
  ),
  security_applicable: applicable(
    'security',
    'Answer no when `diff` cannot introduce exposure (docs, comments, pure formatting). Answer yes for auth, input handling, secrets, network, or similar surfaces.'
  ),
  security: score(
    'How secure is the change in `diff`? Higher means less new exposure. Do not invent issues that the state does not support.',
    SCORE_LEVELS.security
  ),
  blast_radius_applicable: applicable(
    'blast radius',
    'Answer no when the change is isolated docs or the state is too thin to judge coupling. Answer yes when `diff` shows structure that other code could depend on.'
  ),
  blast_radius: score(
    'How much else can the change in `diff` break? Higher means a larger blast radius.',
    SCORE_LEVELS.blast_radius
  ),
  reliability_applicable: applicable(
    'reliability',
    'Answer no when `diff` has no runtime, control-flow, or error paths (docs, comments, pure types). Answer yes when code can fail, throw, retry, or leave state.'
  ),
  reliability: score(
    'How well does the change in `diff` handle failure? Judge error propagation, cleanup, retries, timeouts, races, and recovery. Higher means more reliable.',
    SCORE_LEVELS.reliability
  ),
  reliability_weakness: weakness('reliability', {
    error_propagation: 'Errors are swallowed, distorted, or propagated without useful boundaries.',
    cleanup: 'A failure path can leave resources or state inconsistent.',
    timeout_retry: 'Timeout or retry behavior is missing, unsafe, or disproportionate.',
    concurrency: 'A race or concurrency assumption threatens reliable behavior.',
  }),
  changeability_applicable: applicable(
    'changeability',
    'Answer no when the change is isolated docs or too thin to judge where knowledge lives. Answer yes when `diff` shows structure that the next edit would have to follow.'
  ),
  changeability: score(
    'How easy is the next conceptual change after this `diff`? Judge shotgun surgery, scattered rules, and brittle chains. Higher means a smaller, more predictable edit surface.',
    SCORE_LEVELS.changeability
  ),
  changeability_weakness: weakness('changeability', {
    scattered_rule: 'A domain rule or decision is scattered across multiple locations.',
    shotgun_surgery: 'A small conceptual change is likely to require edits in many places.',
    brittle_chain: 'A brittle dependency chain amplifies otherwise local changes.',
    hidden_dependency: 'Hidden dependencies make the impact of a change unpredictable.',
  }),
  compatibility_applicable: applicable(
    'compatibility',
    'Answer yes only when `diff` touches public APIs, exported types, endpoints, migrations, versions, or integrations. Answer no for internal-only changes with no contract surface.'
  ),
  compatibility: score(
    'How well does the change in `diff` preserve existing contracts? Judge breaking changes, migrations, and interoperability. Higher means more compatible.',
    SCORE_LEVELS.compatibility
  ),
  compatibility_weakness: weakness('compatibility', {
    breaking_change: 'The change appears to break an existing public or integration contract.',
    migration_gap: 'A required migration or compatibility path is missing.',
    version_assumption: 'The implementation assumes a version or capability not established by the state.',
    interoperability: 'The change reduces interoperability across supported consumers.',
  }),
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
