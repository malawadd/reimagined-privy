import { describe, expect, it } from 'vitest';
import {
	buildCanonicalApiRequest,
	canonicalizePublicJwk,
	issueDeveloperAccessToken,
	normalizeDeveloperScopes,
	sha256Base64Url,
	signP256Request,
	validateRequestTimestamp,
	validateWebhookEndpointUrl,
	verifyDeveloperAccessToken,
	verifyP256Signature
} from './developer-api';

describe('developer API security primitives', () => {
	it('accepts only the documented non-signing scopes', () => {
		expect(normalizeDeveloperScopes(['wallets:read', 'org:read', 'wallets:read'])).toEqual([
			'org:read',
			'wallets:read'
		]);
		expect(() => normalizeDeveloperScopes(['approvals:sign'])).toThrow('Unsupported API scope');
	});

	it('never accepts private key material as a registered public key', async () => {
		const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
			'sign',
			'verify'
		]);
		const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
		expect(() => canonicalizePublicJwk(privateJwk)).toThrow('Private key material');
	});

	it('verifies a signature over the entire canonical request', async () => {
		const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
			'sign',
			'verify'
		]);
		const [publicJwk, privateJwk] = await Promise.all([
			crypto.subtle.exportKey('jwk', pair.publicKey),
			crypto.subtle.exportKey('jwk', pair.privateKey)
		]);
		const message = buildCanonicalApiRequest({
			method: 'POST',
			target: '/v1/payments',
			contentDigest: await sha256Base64Url('{}'),
			timestamp: String(Date.now()),
			nonce: 'abcdefghijklmnop',
			credentialId: 'rcred_abcdefghijklmnop',
			idempotencyKey: 'payment_123456789'
		});
		const signature = await signP256Request(privateJwk, message);
		const publicKey = canonicalizePublicJwk(publicJwk);
		expect(await verifyP256Signature({ publicJwk: publicKey, message, signature })).toBe(true);
		expect(
			await verifyP256Signature({ publicJwk: publicKey, message: `${message}x`, signature })
		).toBe(false);
	});

	it('rejects stale timestamps and private webhook destinations', () => {
		const now = Date.now();
		expect(validateRequestTimestamp(String(now), now)).toBe(now);
		expect(() => validateRequestTimestamp(String(now - 300_001), now)).toThrow('outside');
		expect(validateWebhookEndpointUrl('https://events.example.com/ratib')).toBe(
			'https://events.example.com/ratib'
		);
		expect(() => validateWebhookEndpointUrl('https://127.0.0.1/ratib')).toThrow('not public');
		expect(() => validateWebhookEndpointUrl('https://[::ffff:127.0.0.1]/ratib')).toThrow(
			'not public'
		);
		expect(() => validateWebhookEndpointUrl('https://[::ffff:7f00:1]/ratib')).toThrow('not public');
		expect(() => validateWebhookEndpointUrl('https://192.0.2.10/ratib')).toThrow('not public');
		expect(() => validateWebhookEndpointUrl('https://198.51.100.10/ratib')).toThrow('not public');
		expect(() => validateWebhookEndpointUrl('https://203.0.113.10/ratib')).toThrow('not public');
		expect(() => validateWebhookEndpointUrl('http://events.example.com/ratib')).toThrow('HTTPS');
	});

	it('issues short-lived organization-bound access tokens and rejects tampering', async () => {
		const secret = 'test-only-token-secret-with-at-least-32-bytes';
		const now = Date.now();
		const issued = await issueDeveloperAccessToken(
			{
				sub: 'service-account-1',
				credentialId: 'rcred_abcdefghijklmnop',
				organizationId: 'organization-1',
				scopes: ['org:read']
			},
			secret,
			now
		);
		expect(issued.expiresIn).toBe(600);
		const claims = await verifyDeveloperAccessToken(issued.accessToken, secret, now + 599_000);
		expect(claims).toMatchObject({
			sub: 'service-account-1',
			credentialId: 'rcred_abcdefghijklmnop',
			organizationId: 'organization-1',
			scopes: ['org:read']
		});
		await expect(
			verifyDeveloperAccessToken(`${issued.accessToken.slice(0, -1)}x`, secret, now)
		).rejects.toThrow('invalid_access_token');
		await expect(
			verifyDeveloperAccessToken(issued.accessToken, secret, now + 601_000)
		).rejects.toThrow('invalid_access_token');
	});
});
