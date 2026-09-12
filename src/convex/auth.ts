'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { verifyAccessToken } from '@privy-io/node';
import { importPKCS8, SignJWT } from 'jose';

export const exchange = internalAction({
	args: { accessToken: v.string() },
	handler: async (_ctx, args) => {
		const appId = required('PRIVY_APP_ID');
		const mockAuthEnabled =
			process.env.PRIVY_MODE === 'mock' && process.env.ALLOW_INSECURE_MOCK_AUTH === 'true';
		const verified = mockAuthEnabled
			? verifyLocalMockToken(args.accessToken, appId)
			: await verifyAccessToken({
					access_token: args.accessToken,
					app_id: appId,
					verification_key: required('PRIVY_JWT_VERIFICATION_KEY')
				});
		if (verified.app_id !== appId || verified.expiration <= Math.floor(Date.now() / 1000))
			throw new Error('Invalid Privy access token.');
		const issuer = required('AUTH_ISSUER');
		const key = await importPKCS8(required('AUTH_PRIVATE_KEY_PEM').replace(/\\n/g, '\n'), 'RS256');
		const now = Math.floor(Date.now() / 1000);
		return new SignJWT({ sid: verified.session_id })
			.setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: required('AUTH_JWT_KID') })
			.setSubject(verified.user_id)
			.setIssuer(issuer)
			.setAudience('convex')
			.setIssuedAt(now)
			.setExpirationTime(now + 300)
			.sign(key);
	}
});

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not configured.`);
	return value;
}

function verifyLocalMockToken(accessToken: string, appId: string) {
	if (accessToken !== 'mock-privy-access-token') throw new Error('Invalid local mock token.');
	return {
		app_id: appId,
		user_id: 'did:privy:mock-operator',
		session_id: 'local-mock-session',
		expiration: Math.floor(Date.now() / 1000) + 300
	};
}
