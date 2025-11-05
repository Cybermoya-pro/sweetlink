export const DEFAULT_APP_LABEL = 'your application';
export function normalizeAppLabel(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
export function formatAppLabel(label) {
    return normalizeAppLabel(label) ?? DEFAULT_APP_LABEL;
}
export function describeAppForPrompt(label) {
    const formatted = formatAppLabel(label);
    if (/^(?:the|a|an|your)\b/i.test(formatted)) {
        return formatted;
    }
    return `the "${formatted}" application`;
}
//# sourceMappingURL=app-label.js.map