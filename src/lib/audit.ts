const secretKeys =
	/secret|password|private.?key|authorization|access.?token|refresh.?token|api.?key|signature|cookie/i;
const secretValue = /^(?:bearer|basic|token)\s+\S+|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;

const MAX_DEPTH = 8;
const MAX_ITEMS = 100;
const MAX_STRING_LENGTH = 1_000;

export function redactAuditMetadata(value: unknown, depth = 0): unknown {
	if (depth >= MAX_DEPTH) return '[TRUNCATED]';
	if (typeof value === 'string') {
		if (secretValue.test(value.trim())) return '[REDACTED]';
		return value.length > MAX_STRING_LENGTH
			? `${value.slice(0, MAX_STRING_LENGTH)}[TRUNCATED]`
			: value;
	}
	if (Array.isArray(value))
		return value.slice(0, MAX_ITEMS).map((item) => redactAuditMetadata(item, depth + 1));
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.slice(0, MAX_ITEMS)
			.map(([key, item]) => [
				key,
				secretKeys.test(key) ? '[REDACTED]' : redactAuditMetadata(item, depth + 1)
			])
	);
}
