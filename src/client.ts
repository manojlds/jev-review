import { TypeSafeClient } from '@typesafe-ai/sdk';

import { reviewQuestions } from './questions.js';
import type { ReviewState } from './state.js';

export function resolveApiKey(): string {
  const key = firstNonEmpty(process.env.TYPESAFE_API_KEY, process.env.JEV_API_KEY);
  if (!key) {
    throw new Error(
      'Missing API key. Set TYPESAFE_API_KEY or JEV_API_KEY. Get a key at https://console.typesafe.ai/'
    );
  }
  return key;
}

export function hasApiKey(): boolean {
  return firstNonEmpty(process.env.TYPESAFE_API_KEY, process.env.JEV_API_KEY) !== undefined;
}

export function createClient(apiKey = resolveApiKey()): TypeSafeClient {
  return new TypeSafeClient({ apiKey, timeout: 30_000 });
}

export async function evaluateReview(state: ReviewState, apiKey?: string) {
  const client = createClient(apiKey ?? resolveApiKey());
  return client.systemOne({
    state: {
      task: state.task,
      ...(state.commitMessages ? { commit_messages: state.commitMessages } : {}),
      source: state.source,
      files: state.files,
      omitted: state.omitted,
      diff: state.diff,
      truncated: state.truncated,
    },
    questions: reviewQuestions,
  });
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}
