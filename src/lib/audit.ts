const secretKeys = /secret|private.?key|authorization|token|signature/i;

export function redactAuditMetadata(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(redactAuditMetadata);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>).map(([key, item]) => [
			key,
			secretKeys.test(key) ? '[REDACTED]' : redactAuditMetadata(item)
		])
	);
}
