'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { createPrivyGateway } from './privy/gateway';

export const authorize = internalAction({
	args: {
		operationId: v.id('operations'),
		intentId: v.string(),
		signature: v.string(),
		timestamp: v.number(),
		accessToken: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const provider = await createPrivyGateway().authorizeIntent(
			args.intentId,
			args.signature,
			args.timestamp,
			args.accessToken
		);
		await ctx.runMutation(internal.operationState.applyProviderState, {
			operationId: args.operationId,
			provider,
			source: 'reconciliation'
		});
		return null;
	}
});
