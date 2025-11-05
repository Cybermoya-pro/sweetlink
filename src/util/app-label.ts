export const DEFAULT_APP_LABEL = 'your application';

export function normalizeAppLabel(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function formatAppLabel(label: string | null | undefined): string {
  return normalizeAppLabel(label) ?? DEFAULT_APP_LABEL;
}

export function describeAppForPrompt(label: string | null | undefined): string {
  const formatted = formatAppLabel(label);
  if (/^(?:the|a|an|your)\b/i.test(formatted)) {
    return formatted;
  }
  return `the "${formatted}" application`;
}
