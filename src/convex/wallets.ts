import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { requireMembership, assertOrgScoped } from './lib/authz';
import { internal } from './_generated/api';

export const list = query({
	args: { organizationId: v.id('organizations') },
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		return ctx.db
			.query('wallets')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.collect();
	}
});
export const get = query({
	args: { organizationId: v.id('organizations'), walletId: v.id('wallets') },
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		const wallet = await ctx.db.get(args.walletId);
		assertOrgScoped(wallet, args.organizationId);
		return wallet;
	}
});
export const provision = mutation({
	args: { organizationId: v.id('organizations'), name: v.string(), ownerQuorumId: v.string() },
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'wallet:manage');
		const correlationId = `wallet:${args.organizationId}:${Date.now()}`;
		await ctx.scheduler.runAfter(0, internal.privyActions.provisionWallet, {
			...args,
			correlationId,
			actorId: user.privyDid
		});
		return { correlationId };
	}
});
export const requestUpdate = mutation({
	args: { organizationId: v.id('organizations'), walletId: v.id('wallets'), update: v.any() },
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'wallet:manage');
		const wallet = await ctx.db.get(args.walletId);
		assertOrgScoped(wallet, args.organizationId);
		const operationId = await ctx.db.insert('operations', {
			organizationId: args.organizationId,
			kind: 'walletUpdate',
			status: 'queued',
			approvalPath: 'privyIntent',
			reference: 'Wallet control update',
			createdBy: user._id,
			correlationId: `wallet-update:${args.walletId}:${Date.now()}`,
			createdAt: Date.now(),
			updatedAt: Date.now()
		});
		await ctx.scheduler.runAfter(0, internal.privyActions.requestWalletUpdate, {
			operationId,
			privyWalletId: wallet.privyWalletId,
			update: args.update
		});
		return operationId;
	}
});
export const sync = mutation({
	args: { organizationId: v.id('organizations'), walletId: v.id('wallets') },
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:manage');
		const wallet = await ctx.db.get(args.walletId);
		assertOrgScoped(wallet, args.organizationId);
		await ctx.scheduler.runAfter(0, internal.privyActions.syncWallet, {
			walletId: args.walletId,
			privyWalletId: wallet.privyWalletId
		});
	}
});
