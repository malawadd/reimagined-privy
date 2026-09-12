import { v } from 'convex/values';
import { query, mutation } from './_generated/server';
import { requireMembership, assertOrgScoped, requirePlatformOperator } from './lib/authz';
import { internal } from './_generated/api';
import { walletBalanceDocumentValidator, walletDocumentValidator } from './lib/validators';

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(walletDocumentValidator),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		return ctx.db
			.query('wallets')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.take(100);
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
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		const wallets = await ctx.db
			.query('wallets')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.take(100);
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
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		const wallet = await ctx.db.get(args.walletId);
		assertOrgScoped(wallet, args.organizationId);
		return wallet;
	}
});
export const provisionPilotWallet = mutation({
	args: { organizationId: v.id('organizations'), name: v.string() },
	returns: v.object({ correlationId: v.string() }),
	handler: async (ctx, args) => {
		const operator = await requirePlatformOperator(ctx);
		const organization = await ctx.db.get(args.organizationId);
		if (!organization?.active)
			throw new Error('Pilot organization must be active before wallet provisioning.');
		const [ownerQuorum, policies, principals] = await Promise.all([
			ctx.db
				.query('reviewerQuorums')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.unique(),
			ctx.db
				.query('policies')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.take(100),
			ctx.db
				.query('servicePrincipals')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.take(100)
		]);
		if (!ownerQuorum)
			throw new Error('Verified reviewer quorum is required before wallet provisioning.');
		const ownerPolicy = policies.find(
			(policy) => policy.kind === 'owner' && policy.status === 'active'
		);
		if (!ownerPolicy)
			throw new Error('Active owner policy is required before wallet provisioning.');
		const automationPolicy = policies.find(
			(policy) => policy.kind === 'signerOverride' && policy.status === 'active'
		);
		const automationPrincipal = principals.find((principal) => principal.status === 'active');
		if (Boolean(automationPolicy) !== Boolean(automationPrincipal))
			throw new Error('Automation policy and service principal must be provisioned together.');
		const name = args.name.trim();
		if (!name || name.length > 100) throw new Error('Enter a wallet name up to 100 characters.');
		const correlationId = `wallet:${args.organizationId}:${crypto.randomUUID()}`;
		await ctx.scheduler.runAfter(0, internal.privyActions.provisionWallet, {
			organizationId: args.organizationId,
			name,
			ownerQuorumId: ownerQuorum.privyOwnerId,
			ownerPolicyId: ownerPolicy.privyPolicyId,
			automationSignerId: automationPrincipal?.privyAuthorizationKeyId,
			automationPolicyId: automationPolicy?.privyPolicyId,
			correlationId,
			actorId: operator.subject
		});
		return { correlationId };
	}
});
export const requestDisplayNameUpdate = mutation({
	args: { organizationId: v.id('organizations'), walletId: v.id('wallets'), name: v.string() },
	returns: v.id('operations'),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'wallet:manage');
		const wallet = await ctx.db.get(args.walletId);
		assertOrgScoped(wallet, args.organizationId);
		const name = args.name.trim();
		if (!name || name.length > 100) throw new Error('Enter a wallet name up to 100 characters.');
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
			update: { display_name: name }
		});
		return operationId;
	}
});
export const sync = mutation({
	args: { organizationId: v.id('organizations'), walletId: v.id('wallets') },
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:manage');
		const wallet = await ctx.db.get(args.walletId);
		assertOrgScoped(wallet, args.organizationId);
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
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		const wallet = await ctx.db.get(args.walletId);
		assertOrgScoped(wallet, args.organizationId);
		await ctx.scheduler.runAfter(0, internal.privyActions.refreshWalletBalance, {
			organizationId: args.organizationId,
			walletId: wallet._id,
			privyWalletId: wallet.privyWalletId
		});
		return null;
	}
});
