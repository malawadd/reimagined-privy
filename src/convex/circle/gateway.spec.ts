import { describe, expect, it, vi } from 'vitest';
import { CircleSandboxGateway } from './gateway';

const key = 'sandbox-key';

describe('Circle sandbox gateway', () => {
	it('creates a pending Base recipient without exposing credentials', async () => {
		const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			expect(init?.headers).toMatchObject({ authorization: `Bearer ${key}` });
			expect(String(init?.body)).toContain('"chain":"BASE"');
			return new Response(
				JSON.stringify({
					data: {
						id: 'recipient_12345',
						address: '0x0000000000000000000000000000000000000001',
						chain: 'BASE',
						status: 'pending'
					}
				}),
				{ status: 201, headers: { 'content-type': 'application/json' } }
			);
		});
		const gateway = new CircleSandboxGateway(key, fetcher as typeof fetch);
		await expect(
			gateway.createRecipient({
				idempotencyKey: 'ba943ff1-ca16-49b2-ba55-1057e70ca5c7',
				address: '0x0000000000000000000000000000000000000001',
				nickname: 'Vendor',
				businessName: 'Ratib test'
			})
		).resolves.toMatchObject({ status: 'pending', chain: 'BASE' });
	});

	it('maps provider rejection to a stable sanitized error', async () => {
		const fetcher = vi.fn(
			async () => new Response(JSON.stringify({ message: `never leak ${key}` }), { status: 400 })
		);
		const gateway = new CircleSandboxGateway(key, fetcher as typeof fetch);
		await expect(gateway.getRecipient('recipient_12345')).rejects.toThrow(
			'circle_request_rejected'
		);
	});
});
