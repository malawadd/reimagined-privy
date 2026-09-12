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
});
