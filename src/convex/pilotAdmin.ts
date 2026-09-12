import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { requirePlatformOperator } from './lib/authz';
import { appendAudit } from './lib/audit';

export const configureReviewerQuorum = mutation({
	args: {
		organizationId: v.id('organizations'),
		privyOwnerId: v.string(),
		threshold: v.number(),
		reviewerCount: v.number(),
		mfaRequired: v.boolean()
	},
	returns: v.id('reviewerQuorums'),
	handler: async (ctx, args) => {
		const operator = await requirePlatformOperator(ctx);
		const organization = await ctx.db.get(args.organizationId);
		if (!organization?.active) throw new Error('Pilot organization must be active.');
		if (!args.privyOwnerId.trim()) throw new Error('Privy owner quorum ID is required.');
		if (
			!Number.isInteger(args.threshold) ||
			!Number.isInteger(args.reviewerCount) ||
			args.threshold < 1 ||
			args.threshold > args.reviewerCount
		)
			throw new Error('Reviewer threshold must be a positive integer within the reviewer count.');
		if (!args.mfaRequired) throw new Error('Controlled-pilot reviewer quorums must require MFA.');
		const existing = await ctx.db
			.query('reviewerQuorums')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.unique();
		const value = {
			organizationId: args.organizationId,
			privyOwnerId: args.privyOwnerId.trim(),
			threshold: args.threshold,
			reviewerCount: args.reviewerCount,
			mfaRequired: true,
			syncedAt: Date.now()
		};
		const quorumId = existing
			? (await ctx.db.patch(existing._id, value), existing._id)
			: await ctx.db.insert('reviewerQuorums', value);
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: operator.subject,
			action: 'privy.quorum_configured',
			resourceType: 'reviewerQuorum',
			resourceId: quorumId,
			correlationId: `quorum:${quorumId}`,
			privyIds: [value.privyOwnerId],
			metadata: {
				threshold: value.threshold,
				reviewerCount: value.reviewerCount,
				mfaRequired: true
			}
		});
		return quorumId;
	}
});

export const configureAutomationPrincipal = mutation({
	args: {
		organizationId: v.id('organizations'),
		name: v.string(),
		purpose: v.string(),
		privyAuthorizationKeyId: v.string()
	},
	returns: v.id('servicePrincipals'),
	handler: async (ctx, args) => {
		const operator = await requirePlatformOperator(ctx);
		const organization = await ctx.db.get(args.organizationId);
		if (!organization?.active) throw new Error('Pilot organization must be active.');
		const name = args.name.trim();
		const purpose = args.purpose.trim();
		const privyAuthorizationKeyId = args.privyAuthorizationKeyId.trim();
		if (!name || name.length > 80) throw new Error('Enter a principal name up to 80 characters.');
		if (!purpose || purpose.length > 160)
			throw new Error('Enter a principal purpose up to 160 characters.');
		if (!privyAuthorizationKeyId || privyAuthorizationKeyId.length > 200)
			throw new Error('Enter the Privy authorization key ID.');
		const principals = await ctx.db
			.query('servicePrincipals')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.take(100);
		for (const principal of principals)
			if (principal.status === 'active') await ctx.db.patch(principal._id, { status: 'revoked' });
		const principalId = await ctx.db.insert('servicePrincipals', {
			organizationId: args.organizationId,
			name,
			purpose,
			privyAuthorizationKeyId,
			status: 'active'
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: operator.subject,
			action: 'privy.automation_principal_configured',
			resourceType: 'servicePrincipal',
			resourceId: principalId,
			correlationId: `principal:${principalId}`,
			privyIds: [privyAuthorizationKeyId],
			metadata: { purpose }
		});
		return principalId;
	}
});
