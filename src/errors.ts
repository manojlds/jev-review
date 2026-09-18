import { APIError } from '@typesafe-ai/sdk';

export function sanitizeError(message: string): string {
  return message
    .replaceAll(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replaceAll(/\b(TYPESAFE_API_KEY|JEV_API_KEY)\s*[:=]\s*\S+/gi, '$1=[redacted]');
}

export function formatCliError(error: unknown): string {
  if (error instanceof APIError) {
    const type = errorType(error.body);
    if (type === 'max_tokens_exceeded') {
      return [
        'Jev rejected the request: the state exceeds the ~32k token budget.',
        'Review a smaller change with --diff <file.patch>, or commit once and diff against HEAD.',
        'Lockfiles and binaries are already omitted from the Jev state.',
      ].join(' ');
    }
    return `Jev API ${error.status}${type ? ` (${type})` : ''}: ${sanitizeError(error.message)}`;
  }

  const message = error instanceof Error ? error.message : String(error);
  return sanitizeError(message);
}

function errorType(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const detail = (body as { detail?: unknown }).detail;
  if (!detail || typeof detail !== 'object') return undefined;
  const type = (detail as { error_type?: unknown }).error_type;
  return typeof type === 'string' ? type : undefined;
}
