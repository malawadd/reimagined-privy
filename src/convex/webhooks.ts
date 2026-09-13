'use node';

import { v } from 'convex/values';
import { Webhook } from 'svix';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { privyWebhookEnvelope } from './privy/events';

export function verifyPrivyWebhookPayload(
	rawBody: string,
	headers: { svixId: string; svixTimestamp: string; svixSignature: string },
	signingKey: string
) {
	new Webhook(signingKey).verify(rawBody, {
		'svix-id': headers.svixId,
		'svix-timestamp': headers.svixTimestamp,
		'svix-signature': headers.svixSignature
	});
	return privyWebhookEnvelope.parse(JSON.parse(rawBody));
}

export const verifyAndStore = internalAction({
	args: {
		rawBody: v.string(),
		svixId: v.string(),
		svixTimestamp: v.string(),
		svixSignature: v.string()
	},
	returns: v.object({ duplicate: v.boolean(), receiptId: v.id('webhookReceipts') }),
	handler: async (ctx, args): Promise<{ duplicate: boolean; receiptId: Id<'webhookReceipts'> }> => {
		const signingKey = process.env.PRIVY_WEBHOOK_SIGNING_KEY;
		if (!signingKey) throw new Error('Webhook signing key is not configured.');
		const payload = verifyPrivyWebhookPayload(args.rawBody, args, signingKey) as Record<
			string,
			unknown
		>;
		return ctx.runMutation(internal.webhookProcessing.insertReceipt, {
			svixMessageId: args.svixId,
			eventType: String(payload.type ?? 'unknown'),
			payloadIdempotencyKey:
				typeof payload.idempotency_key === 'string' ? payload.idempotency_key : undefined,
			payload
		});
	}
});

export const processSafely = internalAction({
	args: { receiptId: v.id('webhookReceipts') },
	returns: v.null(),
	handler: async (ctx, args) => {
		try {
			await ctx.runMutation(internal.webhookProcessing.processReceipt, args);
		} catch (error) {
			const code =
				error instanceof Error
					? error.message.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 120)
					: 'webhook_processing_failed';
			await ctx.runMutation(internal.webhookProcessing.markProcessed, {
				receiptId: args.receiptId,
				error: code
			});
		}
		return null;
	}
});
