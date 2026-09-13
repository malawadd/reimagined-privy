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
	asset: v.optional(v.union(v.literal('ETH'), v.literal('USDC'))),
	amount: v.optional(v.string()),
	policySummary: v.string()
};

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(
		v.object({
			_id: v.id('automations'),
			_creationTime: v.number(),
			organizationId: v.id('organizations'),
			name: v.string(),
			type: v.union(v.literal('recurringPayment'), v.literal('depositSweep')),
			status: v.union(v.literal('active'), v.literal('paused')),
			servicePrincipalId: v.id('servicePrincipals'),
			schedule: v.optional(v.string()),
			sourceWalletId: v.optional(v.id('wallets')),
			destination: v.string(),
			asset: v.union(v.literal('ETH'), v.literal('USDC')),
			amount: v.optional(v.string()),
			nextRunAt: v.optional(v.number()),
			policySummary: v.string(),
			createdBy: v.id('users')
		})
	),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		return ctx.db
			.query('automations')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.take(100);
	}
});
export const create = mutation({
	args: input,
	returns: v.id('automations'),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'automation:manage');
		const principal = await ctx.db.get(args.servicePrincipalId);
		assertOrgScoped(principal, args.organizationId);
		if (principal.status !== 'active')
			throw new Error('Select an active automation service principal.');
		const asset = args.asset ?? 'USDC';
		if (args.type === 'recurringPayment' && asset !== 'USDC')
			throw new Error('Recurring automation remains limited to USDC.');
		return ctx.db.insert('automations', {
			...args,
			destination: normalizeEvmAddress(args.destination),
			amount: args.amount ? normalizeDecimal(args.amount, asset === 'ETH' ? 18 : 6) : undefined,
			asset,
			status: 'active',
			createdBy: user._id
		});
	}
});
export const update = mutation({
	args: {
		organizationId: v.id('organizations'),
		automationId: v.id('automations'),
		name: v.optional(v.string()),
		schedule: v.optional(v.string()),
		amount: v.optional(v.string()),
		nextRunAt: v.optional(v.number()),
		policySummary: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'automation:manage');
		const automation = await ctx.db.get(args.automationId);
		assertOrgScoped(automation, args.organizationId);
		const principal = await ctx.db.get(automation.servicePrincipalId);
		assertOrgScoped(principal, args.organizationId);
		if (principal.status !== 'active') throw new Error('The automation signer is revoked.');
		const name = args.name?.trim();
		const policySummary = args.policySummary?.trim();
		if (name !== undefined && (!name || name.length > 80))
			throw new Error('Automation name must be 1 to 80 characters.');
		if (policySummary !== undefined && (!policySummary || policySummary.length > 240))
			throw new Error('Policy summary must be 1 to 240 characters.');
		await ctx.db.patch(args.automationId, {
			...(name !== undefined ? { name } : {}),
			...(args.schedule !== undefined ? { schedule: args.schedule.trim() } : {}),
			...(args.amount !== undefined
				? { amount: normalizeDecimal(args.amount, automation.asset === 'ETH' ? 18 : 6) }
				: {}),
			...(args.nextRunAt !== undefined ? { nextRunAt: args.nextRunAt } : {}),
			...(policySummary !== undefined ? { policySummary } : {})
		});
		return null;
	}
});
export const pause = mutation({
	args: { organizationId: v.id('organizations'), automationId: v.id('automations') },
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'automation:manage');
		const automation = await ctx.db.get(args.automationId);
		assertOrgScoped(automation, args.organizationId);
		await ctx.db.patch(args.automationId, { status: 'paused' });
		return null;
	}
});
export const resume = mutation({
	args: { organizationId: v.id('organizations'), automationId: v.id('automations') },
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'automation:manage');
		const automation = await ctx.db.get(args.automationId);
		assertOrgScoped(automation, args.organizationId);
		const principal = await ctx.db.get(automation.servicePrincipalId);
		assertOrgScoped(principal, args.organizationId);
		if (principal.status !== 'active') throw new Error('The automation signer is revoked.');
		await ctx.db.patch(args.automationId, { status: 'active' });
		return null;
	}
});
export const runNow = mutation({
	args: { organizationId: v.id('organizations'), automationId: v.id('automations') },
	returns: v.id('automationRuns'),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'automation:manage');
		const automation = await ctx.db.get(args.automationId);
		assertOrgScoped(automation, args.organizationId);
		if (automation.status !== 'active')
			throw new Error('Resume this automation before running it.');
		const principal = await ctx.db.get(automation.servicePrincipalId);
		assertOrgScoped(principal, args.organizationId);
		if (principal.status !== 'active') throw new Error('The automation signer is revoked.');
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
	returns: v.array(
		v.object({
			_id: v.id('automationRuns'),
			_creationTime: v.number(),
			organizationId: v.id('organizations'),
			automationId: v.id('automations'),
			runKey: v.string(),
			amount: v.optional(v.string()),
			sourceEventId: v.optional(v.string()),
			scheduledFor: v.optional(v.number()),
			status: v.union(
				v.literal('pending'),
				v.literal('claimed'),
				v.literal('submitted'),
				v.literal('succeeded'),
				v.literal('failed'),
				v.literal('ambiguous')
			),
			claimedAt: v.optional(v.number()),
			providerReferenceId: v.string(),
			operationId: v.optional(v.id('operations')),
			updatedAt: v.number()
		})
	),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		const automation = await ctx.db.get(args.automationId);
		assertOrgScoped(automation, args.organizationId);
		return ctx.db
			.query('automationRuns')
			.withIndex('by_automation', (q) => q.eq('automationId', args.automationId))
			.order('desc')
			.take(100);
	}
});
