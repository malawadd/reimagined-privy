import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	decryptERPNextCredentials,
	encryptERPNextCredentials,
	erpCredentialContext
} from './credentials';

describe('ERPNext credential encryption', () => {
	const key = randomBytes(32).toString('base64');
	const context = erpCredentialContext('org_123', 'https://erp.example.com');
	const credentials = { apiKey: 'api-key-1234', apiSecret: 'secret-value-1234' };

	it('round trips AES-256-GCM ciphertext without embedding plaintext', () => {
		const envelope = encryptERPNextCredentials(credentials, key, context);
		expect(JSON.stringify(envelope)).not.toContain(credentials.apiKey);
		expect(JSON.stringify(envelope)).not.toContain(credentials.apiSecret);
		expect(decryptERPNextCredentials(envelope, key, context)).toEqual(credentials);
	});

	it('uses a fresh IV and binds ciphertext to its organization and URL', () => {
		const first = encryptERPNextCredentials(credentials, key, context);
		const second = encryptERPNextCredentials(credentials, key, context);
		expect(first.iv).not.toBe(second.iv);
		expect(first.ciphertext).not.toBe(second.ciphertext);
		expect(() => decryptERPNextCredentials(first, key, `${context}:other`)).toThrow(
			'Unable to decrypt ERP credentials'
		);
	});

	it('rejects tampering and incorrectly sized keys', () => {
		const envelope = encryptERPNextCredentials(credentials, key, context);
		const replacement = envelope.ciphertext[0] === 'A' ? 'B' : 'A';
		expect(() =>
			decryptERPNextCredentials(
				{ ...envelope, ciphertext: `${replacement}${envelope.ciphertext.slice(1)}` },
				key,
				context
			)
		).toThrow('Unable to decrypt ERP credentials');
		expect(() => encryptERPNextCredentials(credentials, 'c2hvcnQ=', context)).toThrow(
			'exactly 32 bytes'
		);
	});
});
