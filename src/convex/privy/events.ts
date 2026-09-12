import { z } from 'zod';

export const subscribedPrivyEventFamilies = [
	'intent',
	'wallet_action',
	'transaction',
	'deposit',
	'withdrawal',
	'wallet_security',
	'mfa'
] as const;

export const privyWebhookEnvelope = z
	.object({
		id: z.string().optional(),
		type: z.string(),
		idempotency_key: z.string().optional(),
		created_at: z.union([z.string(), z.number()]).optional(),
		data: z.record(z.string(), z.unknown()).optional()
	})
	.passthrough();

export type PrivyWebhookEnvelope = z.infer<typeof privyWebhookEnvelope>;
