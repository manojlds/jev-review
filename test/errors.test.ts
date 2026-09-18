import { describe, expect, it } from 'vitest';

import { APIError } from '@typesafe-ai/sdk';
import { formatCliError, sanitizeError } from '../src/errors.js';

describe('sanitizeError', () => {
  it('keeps env var names in setup instructions', () => {
    expect(
      sanitizeError(
        'Missing API key. Set TYPESAFE_API_KEY or JEV_API_KEY. Get a key at https://console.typesafe.ai/'
      )
    ).toBe(
      'Missing API key. Set TYPESAFE_API_KEY or JEV_API_KEY. Get a key at https://console.typesafe.ai/'
    );
  });

  it('redacts assigned keys and bearer tokens', () => {
    expect(sanitizeError('TYPESAFE_API_KEY=sk-secret failed')).toBe(
      'TYPESAFE_API_KEY=[redacted] failed'
    );
    expect(sanitizeError('Authorization: Bearer sk-secret')).toBe(
      'Authorization: Bearer [redacted]'
    );
  });
});

describe('formatCliError', () => {
  it('explains a token-budget rejection', () => {
    const error = APIError.fromResponse(
      400,
      { detail: { error_type: 'max_tokens_exceeded' } },
      new Headers()
    );
    expect(formatCliError(error)).toContain('32k token budget');
  });
});
