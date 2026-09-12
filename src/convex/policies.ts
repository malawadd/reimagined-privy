import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireMembership, assertOrgScoped } from './lib/authz';
import { compileOwnerPolicy, compileTreasuryPolicy } from '../lib/policy';
import { internal } from './_generated/api';
import { policyDocumentValidator } from './lib/validators';

const automationTemplateArgs = {
	approvedRecipients: v.array(v.string()),
	treasuryDestination: v.string(),
	automationLimitUsdc: v.optional(v.string())
};

const compiledPolicyValidator = v.object({
	version: v.literal('1.0'),
	chain_type: v.literal('ethereum'),
	name: v.string(),
	rules: v.array(
		v.object({
			name: v.string(),
			method: v.string(),
			conditions: v.array(
				v.object({
					field_source: v.string(),
					field: v.string(),
					operator: v.string(),
					value: v.union(v.string(), v.array(v.string()))
				})
			),
			action: v.literal('ALLOW')
		})
	)
});

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(policyDocumentValidator),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		return ctx.db
			.query('policies')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.take(100);
	}
});

export const get = query({
	args: { organizationId: v.id('organizations'), policyId: v.id('policies') },
	returns: policyDocumentValidator,
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		const policy = await ctx.db.get(args.policyId);
		assertOrgScoped(policy, args.organizationId);
		return policy;
	}
});

export const previewAutomation = query({
	args: { organizationId: v.id('organizations'), ...automationTemplateArgs },
	returns: compiledPolicyValidator,
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'policy:manage');
		return compileTreasuryPolicy(args);
	}
});

export const createOwnerPolicy = mutation({
	args: { organizationId: v.id('organizations'), name: v.string() },
	returns: v.object({ correlationId: v.string() }),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'policy:manage');
		const owner = await requireReviewerQuorum(ctx, args.organizationId);
		const json = compileOwnerPolicy(args.name.trim() || undefined);
		const correlationId = `policy-create:${args.organizationId}:${crypto.randomUUID()}`;
		await ctx.scheduler.runAfter(0, internal.privyActions.createPolicy, {
			organizationId: args.organizationId,
			name: json.name,
			kind: 'owner',
			ownerQuorumId: owner.privyOwnerId,
			json,
			correlationId,
			actorId: user.privyDid
		});
		return { correlationId };
	}
});

export const createAutomationPolicy = mutation({
	args: { organizationId: v.id('organizations'), name: v.string(), ...automationTemplateArgs },
	returns: v.object({ correlationId: v.string() }),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'policy:manage');
		const owner = await requireReviewerQuorum(ctx, args.organizationId);
		const json = compileTreasuryPolicy(args);
		const name = args.name.trim();
		if (!name || name.length > 100) throw new Error('Enter a policy name up to 100 characters.');
		const correlationId = `policy-create:${args.organizationId}:${crypto.randomUUID()}`;
		await ctx.scheduler.runAfter(0, internal.privyActions.createPolicy, {
			organizationId: args.organizationId,
			name,
			kind: 'signerOverride',
			ownerQuorumId: owner.privyOwnerId,
			json: { ...json, name },
			correlationId,
			actorId: user.privyDid
		});
		return { correlationId };
	}
});

export const requestAutomationPolicyUpdate = mutation({
	args: {
		organizationId: v.id('organizations'),
		policyId: v.id('policies'),
		name: v.string(),
		...automationTemplateArgs
	},
	returns: v.id('operations'),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'policy:manage');
		const policy = await ctx.db.get(args.policyId);
		assertOrgScoped(policy, args.organizationId);
		if (policy.kind === 'owner')
			throw new Error('Use an owner-policy-specific workflow for this policy.');
		const json = compileTreasuryPolicy(args);
		const name = args.name.trim();
		if (!name || name.length > 100) throw new Error('Enter a policy name up to 100 characters.');
		const now = Date.now();
		const operationId = await ctx.db.insert('operations', {
			organizationId: args.organizationId,
			kind: 'policyUpdate',
			status: 'queued',
			approvalPath: 'privyIntent',
			reference: `Update ${policy.name}`,
			createdBy: user._id,
			correlationId: `policy-update:${policy._id}:${crypto.randomUUID()}`,
			createdAt: now,
			updatedAt: now
		});
		await ctx.scheduler.runAfter(0, internal.privyActions.requestPolicyUpdate, {
			operationId,
			privyPolicyId: policy.privyPolicyId,
			update: { name, rules: json.rules }
		});
		return operationId;
	}
});

async function requireReviewerQuorum(
	ctx: Parameters<typeof requireMembership>[0],
	organizationId: Parameters<typeof requireMembership>[1]
) {
	const quorum = await ctx.db
		.query('reviewerQuorums')
		.withIndex('by_org', (q) => q.eq('organizationId', organizationId))
		.unique();
	if (!quorum) throw new Error('A verified Privy reviewer quorum must be synchronized first.');
	return quorum;
}
