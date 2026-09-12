import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireMembership, assertOrgScoped } from './lib/authz';
import { deterministicRunKey, normalizeDecimal, normalizeEvmAddress } from '../lib/domain';
import { internal } from './_generated/api';

const input = {
	organizationId: v.id('organizations'),
	name: v.string(),
	type: v.union(v.literal('recurringPayment'), v.literal('depositSweep')),
	servicePrincipalId: v.id('servicePrincipals'),
	schedule: v.optional(v.string()),
	sourceWalletId: v.optional(v.id('wallets')),
	destination: v.string(),
	amount: v.optional(v.string()),
	policySummary: v.string()
};
export const create = mutation({
	args: input,
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'automation:manage');
		const principal = await ctx.db.get(args.servicePrincipalId);
		assertOrgScoped(principal, args.organizationId);
		return ctx.db.insert('automations', {
			...args,
			destination: normalizeEvmAddress(args.destination),
			amount: args.amount ? normalizeDecimal(args.amount, 6) : undefined,
			asset: 'USDC',
			status: 'active',
			createdBy: user._id
		});
	}
});
export const update = mutation({
	args: {
		organizationId: v.id('organizations'),
		automationId: v.id('automations'),
		patch: v.any()
	},
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'automation:manage');
		const automation = await ctx.db.get(args.automationId);
		assertOrgScoped(automation, args.organizationId);
		await ctx.db.patch(args.automationId, args.patch);
	}
});
export const pause = mutation({
	args: { organizationId: v.id('organizations'), automationId: v.id('automations') },
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'automation:manage');
		const automation = await ctx.db.get(args.automationId);
		assertOrgScoped(automation, args.organizationId);
		await ctx.db.patch(args.automationId, { status: 'paused' });
	}
});
export const resume = mutation({
	args: { organizationId: v.id('organizations'), automationId: v.id('automations') },
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'automation:manage');
		const automation = await ctx.db.get(args.automationId);
		assertOrgScoped(automation, args.organizationId);
		await ctx.db.patch(args.automationId, { status: 'active' });
	}
});
export const runNow = mutation({
	args: { organizationId: v.id('organizations'), automationId: v.id('automations') },
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'automation:manage');
		const automation = await ctx.db.get(args.automationId);
		assertOrgScoped(automation, args.organizationId);
		const scheduledFor = Date.now();
		const runKey = deterministicRunKey(args.automationId, scheduledFor);
		const existing = await ctx.db
			.query('automationRuns')
			.withIndex('by_run_key', (q) => q.eq('runKey', runKey))
			.unique();
		if (existing) return existing._id;
		const runId = await ctx.db.insert('automationRuns', {
			organizationId: args.organizationId,
			automationId: args.automationId,
			runKey,
			scheduledFor,
			status: 'pending',
			providerReferenceId: runKey,
			updatedAt: Date.now()
		});
		await ctx.scheduler.runAfter(0, internal.automationExecution.claimAndExecute, { runId });
		return runId;
	}
});
export const listRuns = query({
	args: { organizationId: v.id('organizations'), automationId: v.id('automations') },
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		const automation = await ctx.db.get(args.automationId);
		assertOrgScoped(automation, args.organizationId);
		return ctx.db
			.query('automationRuns')
			.filter((q) => q.eq(q.field('automationId'), args.automationId))
			.order('desc')
			.collect();
	}
});
