import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { unitsToDecimal } from '../lib/domain';

type ProviderBalance = {
	asset?: unknown;
	chain?: unknown;
	raw_value?: unknown;
	raw_value_decimals?: unknown;
};

export const save = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		walletId: v.id('wallets'),
		provider: v.any()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const provider = args.provider as { balances?: unknown };
		const balances = Array.isArray(provider.balances)
			? (provider.balances as ProviderBalance[])
			: [];
		const observedAt = Date.now();

		for (const balance of balances) {
			const asset = String(balance.asset ?? '').toUpperCase();
			if (asset !== 'ETH' && asset !== 'USDC') continue;
			if (String(balance.chain ?? '') !== 'base_sepolia') continue;
			const rawValue = String(balance.raw_value ?? '');
			const decimals = Number(balance.raw_value_decimals);
			if (!/^\d+$/.test(rawValue) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36)
				continue;
			const typedAsset = asset as 'ETH' | 'USDC';
			const existing = await ctx.db
				.query('walletBalances')
				.withIndex('by_wallet_asset', (q) =>
					q.eq('walletId', args.walletId).eq('asset', typedAsset)
				)
				.unique();
			const value = {
				organizationId: args.organizationId,
				walletId: args.walletId,
				chainId: 84532 as const,
				asset: typedAsset,
				rawValue,
				decimals,
				displayValue: unitsToDecimal(rawValue, decimals),
				observedAt
			};
			if (existing) await ctx.db.patch(existing._id, value);
			else await ctx.db.insert('walletBalances', value);
		}
		return null;
	}
});
