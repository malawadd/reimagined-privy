type ProviderErrorShape = {
	status?: unknown;
	code?: unknown;
	error?: unknown;
	message?: unknown;
};

const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429]);

export function providerErrorCode(error: unknown) {
	const shape = asProviderError(error);
	const providerCode = nestedString(shape?.error, 'code') ?? stringValue(shape?.code);
	if (providerCode) return `privy:${providerCode}`;
	return error instanceof Error ? error.message.slice(0, 240) : 'privy_request_failed';
}

export function isDefinitiveProviderRejection(error: unknown) {
	const status = providerHttpStatus(error);
	return (
		status !== undefined && status >= 400 && status < 500 && !RETRYABLE_HTTP_STATUSES.has(status)
	);
}

export function isStoredDefinitiveProviderRejection(errorCode: string | undefined) {
	if (!errorCode) return false;
	if (errorCode === 'privy:invalid_data') return true;
	const status = Number.parseInt(errorCode.match(/^(\d{3})\b/)?.[1] ?? '', 10);
	return (
		Number.isInteger(status) &&
		status >= 400 &&
		status < 500 &&
		!RETRYABLE_HTTP_STATUSES.has(status)
	);
}

function providerHttpStatus(error: unknown) {
	const shape = asProviderError(error);
	if (typeof shape?.status === 'number') return shape.status;
	const message = error instanceof Error ? error.message : '';
	const status = Number.parseInt(message.match(/^(\d{3})\b/)?.[1] ?? '', 10);
	return Number.isInteger(status) ? status : undefined;
}

function asProviderError(error: unknown): ProviderErrorShape | undefined {
	return error && typeof error === 'object' ? (error as ProviderErrorShape) : undefined;
}

function nestedString(value: unknown, key: string) {
	return value && typeof value === 'object' && key in value
		? stringValue((value as Record<string, unknown>)[key])
		: undefined;
}

function stringValue(value: unknown) {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
