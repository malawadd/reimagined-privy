'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { PrivyClient, verifyAccessToken } from '@privy-io/node';
import { importPKCS8, SignJWT } from 'jose';

export const exchange = internalAction({
	args: { accessToken: v.string() },
	returns: v.string(),
	handler: async (_ctx, args) => {
		const appId = required('PRIVY_APP_ID');
		const verified = await verifyAccessToken({
			access_token: args.accessToken,
			app_id: appId,
			verification_key: required('PRIVY_JWT_VERIFICATION_KEY')
		});
		if (verified.app_id !== appId || verified.expiration <= Math.floor(Date.now() / 1000))
			throw new Error('Invalid Privy access token.');
		const privy = new PrivyClient({ appId, appSecret: required('PRIVY_APP_SECRET') });
		const directoryUser = await privy.users()._get(verified.user_id);
		const linkedAccounts = Array.isArray(directoryUser.linked_accounts)
			? directoryUser.linked_accounts
			: [];
		const emailAccount = linkedAccounts.find(
			(account) => account.type === 'email' && typeof account.address === 'string'
		) as { address?: string } | undefined;
		const email = emailAccount?.address?.trim().toLowerCase();
		const name = email?.split('@')[0];
		const issuer = required('AUTH_ISSUER');
		const key = await importPKCS8(required('AUTH_PRIVATE_KEY_PEM').replace(/\\n/g, '\n'), 'RS256');
		const now = Math.floor(Date.now() / 1000);
		return new SignJWT({
			sid: verified.session_id,
			...(email ? { email } : {}),
			...(name ? { name } : {})
		})
			.setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: required('AUTH_JWT_KID') })
			.setSubject(verified.user_id)
			.setIssuer(issuer)
			.setAudience('convex')
			.setIssuedAt(now)
			.setExpirationTime(now + 300)
			.sign(key);
	}
});

export const verifySubject = internalAction({
	args: { accessToken: v.string() },
	returns: v.object({ subject: v.string() }),
	handler: async (_ctx, args) => {
		const appId = required('PRIVY_APP_ID');
		const verified = await verifyAccessToken({
			access_token: args.accessToken,
			app_id: appId,
			verification_key: required('PRIVY_JWT_VERIFICATION_KEY')
		});
		if (verified.app_id !== appId || verified.expiration <= Math.floor(Date.now() / 1000))
			throw new Error('Invalid Privy access token.');
		return { subject: verified.user_id };
	}
});

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not configured.`);
	return value;
}
