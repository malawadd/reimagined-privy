import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { Webhook } from 'svix';
import { verifyPrivyWebhookPayload } from '../src/convex/webhooks';

const signingKey = `whsec_${Buffer.from('privy-starter-webhook-test-key-32').toString('base64')}`;

function signedFixture() {
	const rawBody = JSON.stringify({
		id: 'event_test_01',
		type: 'wallet_action.transfer.succeeded',
		idempotency_key: 'operation:test:01',
		data: { id: 'action_test_01', status: 'succeeded' }
	});
	const svixId = 'msg_test_01';
	const timestamp = new Date();
	return {
		rawBody,
		headers: {
			svixId,
			svixTimestamp: String(Math.floor(timestamp.getTime() / 1000)),
			svixSignature: new Webhook(signingKey).sign(svixId, timestamp, rawBody)
		}
	};
}

describe('Privy webhook verification', () => {
	it('verifies the raw body before parsing the event', () => {
		const fixture = signedFixture();
		expect(verifyPrivyWebhookPayload(fixture.rawBody, fixture.headers, signingKey)).toMatchObject({
			type: 'wallet_action.transfer.succeeded',
			data: { status: 'succeeded' }
		});
	});

	it('rejects a body changed after signing', () => {
		const fixture = signedFixture();
		expect(() =>
			verifyPrivyWebhookPayload(`${fixture.rawBody} `, fixture.headers, signingKey)
		).toThrow();
	});

	it('accepts Privy events whose fields are at the top level', () => {
		const timestamp = new Date();
		const rawBody = JSON.stringify({
			type: 'intent.created',
			intent_id: 'intent_test_02',
			intent_type: 'WALLET',
			status: 'pending',
			created_at: timestamp.getTime()
		});
		const svixId = 'msg_test_02';
		const headers = {
			svixId,
			svixTimestamp: String(Math.floor(timestamp.getTime() / 1000)),
			svixSignature: new Webhook(signingKey).sign(svixId, timestamp, rawBody)
		};
		expect(verifyPrivyWebhookPayload(rawBody, headers, signingKey)).toMatchObject({
			type: 'intent.created',
			intent_id: 'intent_test_02'
		});
	});
});
