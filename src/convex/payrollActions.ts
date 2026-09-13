'use node';

import { v } from 'convex/values';
import { verifyMessage } from 'viem';
import { action } from './_generated/server';
import { internal } from './_generated/api';

export const verifyExternalDestination = action({
	args: {
		organizationId: v.id('organizations'),
		challengeId: v.id('walletVerificationChallenges'),
		signature: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity?.subject) throw new Error('Authentication required.');
		const challenge = await ctx.runQuery(internal.payroll.getExternalVerificationContext, {
			organizationId: args.organizationId,
			challengeId: args.challengeId,
			privyDid: identity.subject
		});
		const valid = await verifyMessage({
			address: challenge.address as `0x${string}`,
			message: challenge.message,
			signature: args.signature as `0x${string}`
		});
		if (!valid) throw new Error('Wallet ownership signature is invalid.');
		await ctx.runMutation(internal.payroll.commitExternalDestination, {
			organizationId: args.organizationId,
			challengeId: args.challengeId,
			privyDid: identity.subject
		});
		return null;
	}
});
