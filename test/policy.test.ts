import { describe, expect, it } from 'vitest';

import {
  combineSlicePolicies,
  decide,
  exitCodeFor,
  noulCertainty,
} from '../src/policy.js';
import {
  approveAnswers,
  commentAnswers,
  docsAnswers,
  lowConfidenceAnswers,
  lowCorrectnessAnswers,
  securityAnswers,
} from './fixtures/answers.js';

describe('decide', () => {
  it('requests changes when a concrete security concern is likely', () => {
    expect(decide(securityAnswers)).toMatchObject({
      decision: 'request_changes',
      rule: 'security_concern',
    });
  });

  it('requests changes when correctness sits in the bottom two levels', () => {
    expect(decide(lowCorrectnessAnswers)).toMatchObject({
      decision: 'request_changes',
      rule: 'low_correctness',
    });
  });

  it('approves a high-confidence safe merge', () => {
    expect(decide(approveAnswers)).toMatchObject({
      decision: 'approve',
      rule: 'safe_to_merge',
    });
  });

  it('does not approve when a human review is still likely', () => {
    const answers = {
      ...approveAnswers,
      needs_human_review: { noul: 0.72 },
      safe_to_merge: { noul: 0.85 },
    };
    expect(decide(answers).decision).not.toBe('approve');
  });

  it('escalates when the winning questions are uncertain', () => {
    expect(decide(lowConfidenceAnswers)).toMatchObject({
      decision: 'escalate',
      rule: 'low_confidence',
    });
  });

  it('comments when the change is mergeable with caveats', () => {
    expect(decide(commentAnswers)).toMatchObject({
      decision: 'comment',
      rule: 'mergeable_with_caveats',
    });
  });

  it('prefers the security gate over low correctness', () => {
    const answers = {
      ...lowCorrectnessAnswers,
      has_security_concern: { noul: 0.9 },
    };
    expect(decide(answers).rule).toBe('security_concern');
  });

  it('does not treat an inapplicable correctness score as a merge block', () => {
    const answers = {
      ...approveAnswers,
      correctness: { applicable: false as const, applicability: 0.11 },
    };
    expect(decide(answers)).toMatchObject({
      decision: 'approve',
      rule: 'safe_to_merge',
    });
  });

  it('approves when test coverage is not assessable instead of scoring it as 0', () => {
    expect(decide(docsAnswers)).toMatchObject({
      decision: 'approve',
      rule: 'safe_to_merge',
    });
  });

  it('does not cite coverage gaps when test_gap is not applicable', () => {
    const answers = {
      ...commentAnswers,
      test_gap: { applicable: false as const, applicability: 0.09 },
    };
    expect(decide(answers).reasons.join(' ')).not.toContain('test_gap');
  });

  it('cites weak reliability and changeability as comment caveats', () => {
    const reasons = decide(commentAnswers).reasons.join(' ');
    expect(reasons).toContain('reliability=1.9');
    expect(reasons).toContain('changeability=1.5');
    expect(reasons).toContain('compatibility=2.4');
  });

  it('does not cite inapplicable reliability or compatibility in comment reasons', () => {
    const answers = {
      ...commentAnswers,
      reliability: { applicable: false as const, applicability: 0.12 },
      compatibility: { applicable: false as const, applicability: 0.09 },
    };
    const reasons = decide(answers).reasons.join(' ');
    expect(reasons).not.toContain('reliability');
    expect(reasons).not.toContain('compatibility');
    expect(reasons).toContain('changeability=1.5');
  });
});

describe('combineSlicePolicies', () => {
  it('returns the single slice policy unchanged', () => {
    expect(
      combineSlicePolicies([{ files: ['src/a.ts'], policy: decide(approveAnswers) }])
    ).toMatchObject({ decision: 'approve', rule: 'safe_to_merge' });
  });

  it('blocks if any slice requests changes', () => {
    expect(
      combineSlicePolicies([
        { files: ['src/a.ts'], policy: decide(approveAnswers) },
        { files: ['src/login.ts'], policy: decide(securityAnswers) },
      ])
    ).toMatchObject({
      decision: 'request_changes',
      rule: 'any_slice_request_changes',
    });
  });

  it('escalates rather than approving when one slice is uncertain', () => {
    expect(
      combineSlicePolicies([
        { files: ['src/a.ts'], policy: decide(approveAnswers) },
        { files: ['src/b.ts'], policy: decide(lowConfidenceAnswers) },
      ])
    ).toMatchObject({
      decision: 'escalate',
      rule: 'any_slice_escalate',
    });
  });

  it('approves only when every slice would approve', () => {
    expect(
      combineSlicePolicies([
        { files: ['src/a.ts'], policy: decide(approveAnswers) },
        { files: ['src/b.ts'], policy: decide(approveAnswers) },
      ])
    ).toMatchObject({
      decision: 'approve',
      rule: 'all_slices_safe_to_merge',
    });
  });
});

describe('noulCertainty', () => {
  it('treats a confident no the same as a confident yes', () => {
    expect(noulCertainty(0.1)).toBe(0.9);
    expect(noulCertainty(0.9)).toBe(0.9);
    expect(noulCertainty(0.5)).toBe(0.5);
  });
});

describe('exitCodeFor', () => {
  it('maps decisions onto process exit codes', () => {
    expect(exitCodeFor('approve')).toBe(0);
    expect(exitCodeFor('comment')).toBe(0);
    expect(exitCodeFor('request_changes')).toBe(1);
    expect(exitCodeFor('escalate')).toBe(2);
  });
});
