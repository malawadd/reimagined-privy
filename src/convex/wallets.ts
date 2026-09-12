import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { requireMembership, requireWalletPermission } from './lib/authz';
import { internal } from './_generated/api';
import { walletBalanceDocumentValidator, walletDocumentValidator } from './lib/validators';
import { assertSatisfiableQuorum } from '../lib/wallet-controls';

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(walletDocumentValidator),
	handler: async (ctx, args) => {
		const { user, membership } = await requireMembership(ctx, args.organizationId, 'wallet:read');
		const wallets = await ctx.db
			.query('wallets')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.take(100);
		if (membership.role === 'owner') return wallets;
		const assignments = await ctx.db
			.query('walletAssignments')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.take(500);
		const visible = new Set(
			assignments
				.filter(
					(assignment) =>
						assignment.organizationId === args.organizationId &&
						assignment.status === 'active' &&
						assignment.permissions.includes('view')
				)
				.map((assignment) => assignment.walletId)
		);
		return wallets.filter((wallet) => visible.has(wallet._id));
	}
});

export const listWithBalances = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(
		v.object({
			wallet: walletDocumentValidator,
			balances: v.array(walletBalanceDocumentValidator)
		})
	),
	handler: async (ctx, args) => {
		const { user, membership } = await requireMembership(ctx, args.organizationId, 'wallet:read');
		let wallets = await ctx.db
			.query('wallets')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.take(100);
		if (membership.role !== 'owner') {
			const assignments = await ctx.db
				.query('walletAssignments')
				.withIndex('by_user', (q) => q.eq('userId', user._id))
				.take(500);
			const visible = new Set(
				assignments
					.filter(
						(assignment) =>
							assignment.organizationId === args.organizationId &&
							assignment.status === 'active' &&
							assignment.permissions.includes('view')
					)
					.map((assignment) => assignment.walletId)
			);
			wallets = wallets.filter((wallet) => visible.has(wallet._id));
		}
		return Promise.all(
			wallets.map(async (wallet) => ({
				wallet,
				balances: await ctx.db
					.query('walletBalances')
					.withIndex('by_wallet_asset', (q) => q.eq('walletId', wallet._id))
					.take(10)
			}))
		);
	}
});
export const get = query({
	args: { organizationId: v.id('organizations'), walletId: v.id('wallets') },
	returns: walletDocumentValidator,
	handler: async (ctx, args) => {
		const { wallet } = await requireWalletPermission(
			ctx,
			args.organizationId,
			args.walletId,
			'view',
			'wallet:read'
		);
		return wallet;
	}
});
export const create = mutation({
	args: {
		organizationId: v.id('organizations'),
		name: v.string(),
		requestKey: v.string()
	},
	returns: v.object({ provisioningRunId: v.id('provisioningRuns') }),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'wallet:manage');
		const name = args.name.trim();
		if (!name || name.length > 100) throw new Error('Enter a wallet name up to 100 characters.');
		const requestKey = args.requestKey.trim();
		if (requestKey.length < 24 || requestKey.length > 120)
			throw new Error('Invalid provisioning request key.');
		const runKey = `wallet:${args.organizationId}:${requestKey}`;
		const existing = await ctx.db
			.query('provisioningRuns')
			.withIndex('by_run_key', (q) => q.eq('runKey', runKey))
			.unique();
		if (existing) return { provisioningRunId: existing._id };
		const provisioningRunId = await ctx.db.insert('provisioningRuns', {
			organizationId: args.organizationId,
			requestedBy: user._id,
			runKey,
			kind: 'wallet',
			walletName: name,
			purpose: 'treasury',
			status: 'pending',
			providerReferenceId: runKey,
			updatedAt: Date.now()
		});
		await ctx.scheduler.runAfter(0, internal.provisioningActions.execute, {
			provisioningRunId
		});
		return { provisioningRunId };
	}
});
export const requestDisplayNameUpdate = mutation({
	args: { organizationId: v.id('organizations'), walletId: v.id('wallets'), name: v.string() },
	returns: v.id('operations'),
	handler: async (ctx, args) => {
		const { user, wallet } = await requireWalletPermission(
			ctx,
			args.organizationId,
			args.walletId,
			'manage',
			'wallet:manage'
		);
		const name = args.name.trim();
		if (!name || name.length > 100) throw new Error('Enter a wallet name up to 100 characters.');
		const operationId = await ctx.db.insert('operations', {
			organizationId: args.organizationId,
			kind: 'walletUpdate',
			status: 'queued',
			approvalPath: 'privyIntent',
			reference: 'Wallet control update',
			createdBy: user._id,
			sourceWalletId: wallet._id,
			correlationId: `wallet-update:${args.walletId}:${Date.now()}`,
			createdAt: Date.now(),
			updatedAt: Date.now()
		});
		await ctx.scheduler.runAfter(0, internal.privyActions.requestWalletUpdate, {
			operationId,
			privyWalletId: wallet.privyWalletId,
			update: { display_name: name }
		});
		return operationId;
	}
});

export const requestApprovalThreshold = mutation({
	args: { organizationId: v.id('organizations'), walletId: v.id('wallets'), threshold: v.number() },
	returns: v.id('operations'),
	handler: async (ctx, args) => {
		const { user, wallet } = await requireWalletPermission(
			ctx,
			args.organizationId,
			args.walletId,
			'manage',
			'wallet:manage'
		);
		const reviewers = await ctx.db
			.query('reviewerMembers')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.take(500);
		const active = reviewers.filter(
			(reviewer) => reviewer.walletId === wallet._id && reviewer.status === 'active'
		);
		assertSatisfiableQuorum(args.threshold, active.length);
		const now = Date.now();
		const operationId = await ctx.db.insert('operations', {
			organizationId: args.organizationId,
			kind: 'quorumUpdate',
			status: 'queued',
			approvalPath: 'privyIntent',
			reference: `Change ${wallet.name} approval threshold to ${args.threshold} of ${active.length}`,
			createdBy: user._id,
			sourceWalletId: wallet._id,
			correlationId: `quorum-threshold:${wallet._id}:${crypto.randomUUID()}`,
			createdAt: now,
			updatedAt: now
		});
		await ctx.db.insert('quorumThresholdChanges', {
			organizationId: args.organizationId,
			operationId,
			walletId: wallet._id,
			previousThreshold: wallet.approvalThreshold ?? 1,
			requestedThreshold: args.threshold,
			createdAt: now
		});
		await ctx.scheduler.runAfter(0, internal.privyActions.requestQuorumUpdate, {
			operationId,
			privyQuorumId: wallet.ownerQuorumId,
			userIds: active.map((reviewer) => reviewer.privyDid),
			threshold: args.threshold
		});
		return operationId;
	}
});
export const sync = mutation({
	args: { organizationId: v.id('organizations'), walletId: v.id('wallets') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const { wallet } = await requireWalletPermission(
			ctx,
			args.organizationId,
			args.walletId,
			'manage',
			'wallet:manage'
		);
		await ctx.scheduler.runAfter(0, internal.privyActions.syncWallet, {
			walletId: args.walletId,
			privyWalletId: wallet.privyWalletId
		});
		return null;
	}
});

export const refreshBalances = mutation({
	args: { organizationId: v.id('organizations'), walletId: v.id('wallets') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const { wallet } = await requireWalletPermission(
			ctx,
			args.organizationId,
			args.walletId,
			'view',
			'wallet:read'
		);
		await ctx.scheduler.runAfter(0, internal.privyActions.refreshWalletBalance, {
			organizationId: args.organizationId,
			walletId: wallet._id,
			privyWalletId: wallet.privyWalletId
		});
		return null;
	}
});
