import { describe, expect, it } from 'vitest';
import {
	isDefinitiveProviderRejection,
	isStoredDefinitiveProviderRejection,
	providerErrorCode
} from './provider-errors';

describe('provider error classification', () => {
	it('treats Privy validation and insufficient-balance responses as definitive', () => {
		const error = Object.assign(new Error('400 invalid data'), {
			status: 400,
			error: { code: 'invalid_data', error: 'Insufficient balance' }
		});
		expect(isDefinitiveProviderRejection(error)).toBe(true);
		expect(providerErrorCode(error)).toBe('privy:invalid_data');
	});

	it('keeps timeouts, conflicts, throttling, and server failures ambiguous', () => {
		for (const status of [408, 409, 425, 429, 500]) {
			expect(
				isDefinitiveProviderRejection(Object.assign(new Error('provider error'), { status }))
			).toBe(false);
		}
	});

	it('recognizes the stored legacy 400 response for repair', () => {
		expect(
			isStoredDefinitiveProviderRejection(
				'400 {"error":"Insufficient balance","code":"invalid_data"}'
			)
		).toBe(true);
	});
});
