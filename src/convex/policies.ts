import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireMembership, assertOrgScoped } from './lib/authz';
import { compileTreasuryPolicy } from '../lib/policy';
import { internal } from './_generated/api';

export const list = query({
	args: { organizationId: v.id('organizations') },
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		return ctx.db
			.query('policies')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.collect();
	}
});
export const get = query({
	args: { organizationId: v.id('organizations'), policyId: v.id('policies') },
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		const policy = await ctx.db.get(args.policyId);
		assertOrgScoped(policy, args.organizationId);
		return policy;
	}
});
export const preview = query({
	args: {
		approvedRecipients: v.array(v.string()),
		treasuryDestination: v.string(),
		automationLimitUsdc: v.optional(v.string())
	},
	handler: async (_ctx, args) => compileTreasuryPolicy(args)
});
export const create = mutation({
	args: {
		organizationId: v.id('organizations'),
		name: v.string(),
		ownerQuorumId: v.string(),
		json: v.any()
	},
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'policy:manage');
		const correlationId = `policy-create:${args.organizationId}:${Date.now()}`;
		await ctx.scheduler.runAfter(0, internal.privyActions.createPolicy, {
			...args,
			correlationId,
			actorId: user.privyDid
		});
		return { correlationId };
	}
});
export const requestUpdate = mutation({
	args: { organizationId: v.id('organizations'), policyId: v.id('policies'), update: v.any() },
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'policy:manage');
		const policy = await ctx.db.get(args.policyId);
		assertOrgScoped(policy, args.organizationId);
		const operationId = await ctx.db.insert('operations', {
			organizationId: args.organizationId,
			kind: 'policyUpdate',
			status: 'queued',
			approvalPath: 'privyIntent',
			reference: 'Policy control update',
			createdBy: user._id,
			correlationId: `policy-update:${args.policyId}:${Date.now()}`,
			createdAt: Date.now(),
			updatedAt: Date.now()
		});
		await ctx.scheduler.runAfter(0, internal.privyActions.requestPolicyUpdate, {
			operationId,
			privyPolicyId: policy.privyPolicyId,
			update: args.update
		});
		return operationId;
	}
});
