'use node';

import { v } from 'convex/values';
import { Webhook } from 'svix';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { privyWebhookEnvelope } from './privy/events';

export const verifyAndStore = internalAction({
	args: {
		rawBody: v.string(),
		svixId: v.string(),
		svixTimestamp: v.string(),
		svixSignature: v.string()
	},
	handler: async (ctx, args) => {
		const signingKey = process.env.PRIVY_WEBHOOK_SIGNING_KEY;
		if (!signingKey) throw new Error('Webhook signing key is not configured.');
		const verified = new Webhook(signingKey).verify(args.rawBody, {
			'svix-id': args.svixId,
			'svix-timestamp': args.svixTimestamp,
			'svix-signature': args.svixSignature
		});
		const payload = privyWebhookEnvelope.parse(verified) as Record<string, unknown>;
		return ctx.runMutation(internal.webhookProcessing.insertReceipt, {
			svixMessageId: args.svixId,
			eventType: String(payload.type ?? 'unknown'),
			payloadIdempotencyKey:
				typeof payload.idempotency_key === 'string' ? payload.idempotency_key : undefined,
			payload
		});
	}
});
