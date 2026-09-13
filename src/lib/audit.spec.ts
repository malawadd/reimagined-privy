import { describe, expect, it } from 'vitest';
import { redactAuditMetadata } from './audit';

describe('audit redaction', () => {
	it('recursively removes secrets before persistence', () => {
		expect(
			redactAuditMetadata({
				appSecret: 'x',
				nested: { authorization_private_key: 'y', safe: 'ok' }
			})
		).toEqual({
			appSecret: '[REDACTED]',
			nested: { authorization_private_key: '[REDACTED]', safe: 'ok' }
		});
	});

	it('redacts secret-shaped values and bounds oversized metadata', () => {
		const result = redactAuditMetadata({
			header: 'Bearer live-access-token',
			apiKey: 'visible-by-name',
			note: 'x'.repeat(1_100),
			items: Array.from({ length: 110 }, (_, index) => index)
		}) as Record<string, unknown>;
		expect(result.header).toBe('[REDACTED]');
		expect(result.apiKey).toBe('[REDACTED]');
		expect(String(result.note)).toHaveLength(1_011);
		expect(result.items).toHaveLength(100);
	});
});
