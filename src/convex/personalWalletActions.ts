'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { PrivyClient } from '@privy-io/node';

export const discover = internalAction({
	args: { organizationId: v.id('organizations'), privyDid: v.string() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const appId = required('PRIVY_APP_ID');
		const client = new PrivyClient({ appId, appSecret: required('PRIVY_APP_SECRET') });
		const user = await client.users()._get(args.privyDid);
		const organizationWalletIds = await ctx.runQuery(internal.payroll.organizationWalletIds, {
			organizationId: args.organizationId
		});
		const account = (user.linked_accounts as unknown as Array<Record<string, unknown>>).find(
			(candidate) =>
				candidate.type === 'wallet' &&
				candidate.wallet_client_type === 'privy' &&
				candidate.chain_type === 'ethereum' &&
				typeof candidate.address === 'string' &&
				!organizationWalletIds.includes(String(candidate.id ?? candidate.wallet_id))
		);
		if (!account) throw new Error('No Privy personal Ethereum wallet is linked to this user.');
		await ctx.runMutation(internal.payroll.savePersonalWallet, {
			organizationId: args.organizationId,
			privyDid: args.privyDid,
			privyWalletId: String(account.id ?? account.wallet_id),
			address: String(account.address)
		});
		return null;
	}
});

function required(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not configured.`);
	return value;
}
