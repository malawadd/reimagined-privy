import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireMembership, assertOrgScoped } from './lib/authz';
import { appendAudit } from './lib/audit';
import {
	canonicalizePublicJwk,
	normalizeCredentialKeyId,
	normalizeDeveloperScopes
} from '../lib/developer-api';

const accountInput = {
	organizationId: v.id('organizations'),
	name: v.string(),
	purpose: v.string(),
	scopes: v.array(v.string()),
	walletIds: v.array(v.id('wallets')),
	keyId: v.string(),
	publicJwk: v.any(),
	expiresAt: v.optional(v.number())
};

function cleanText(value: string, label: string, max: number): string {
	const cleaned = value.trim();
	if (!cleaned || cleaned.length > max) throw new Error(`${label} must be 1 to ${max} characters.`);
	return cleaned;
}

function validateExpiry(expiresAt: number | undefined): number | undefined {
	if (expiresAt === undefined) return undefined;
	const now = Date.now();
	if (!Number.isSafeInteger(expiresAt) || expiresAt < now + 300_000)
		throw new Error('Credential expiry must be at least five minutes in the future.');
	if (expiresAt > now + 366 * 24 * 60 * 60 * 1_000)
		throw new Error('Credential expiry cannot exceed one year.');
	return expiresAt;
}

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'org:manage');
		const accounts = await ctx.db
			.query('developerServiceAccounts')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(100);
		return Promise.all(
			accounts.map(async (account) => ({
				...account,
				credentials: await ctx.db
					.query('developerCredentials')
					.withIndex('by_account', (q) => q.eq('serviceAccountId', account._id))
					.order('desc')
					.take(20)
			}))
		);
	}
});

export const create = mutation({
	args: accountInput,
	returns: v.object({
		serviceAccountId: v.id('developerServiceAccounts'),
		credentialId: v.id('developerCredentials'),
		keyId: v.string()
	}),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'org:manage');
		const name = cleanText(args.name, 'Service account name', 80);
		const purpose = cleanText(args.purpose, 'Purpose', 180);
		const scopes = normalizeDeveloperScopes(args.scopes);
		const keyId = normalizeCredentialKeyId(args.keyId);
		const publicJwk = canonicalizePublicJwk(args.publicJwk);
		const expiresAt = validateExpiry(args.expiresAt);
		if (scopes.includes('payments:create') && args.walletIds.length === 0)
			throw new Error('Payment service accounts require at least one wallet restriction.');
		for (const walletId of new Set(args.walletIds)) {
			const wallet = await ctx.db.get(walletId);
			assertOrgScoped(wallet, args.organizationId);
		}
		const existing = await ctx.db
			.query('developerCredentials')
			.withIndex('by_key_id', (q) => q.eq('keyId', keyId))
			.unique();
		if (existing) throw new Error('Credential key ID is already registered.');
		const now = Date.now();
		const serviceAccountId = await ctx.db.insert('developerServiceAccounts', {
			organizationId: args.organizationId,
			name,
			purpose,
			scopes,
			walletIds: [...new Set(args.walletIds)],
			status: 'active',
			createdBy: user._id,
			createdAt: now,
			expiresAt
		});
		const credentialId = await ctx.db.insert('developerCredentials', {
			organizationId: args.organizationId,
			serviceAccountId,
			keyId,
			algorithm: 'ES256',
			publicJwk,
			status: 'active',
			createdAt: now,
			expiresAt
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'developer.service_account_created',
			resourceType: 'developerServiceAccount',
			resourceId: String(serviceAccountId),
			correlationId: `developer-account:${serviceAccountId}`,
			metadata: { keyId, scopes, walletIds: args.walletIds, expiresAt }
		});
		return {
			serviceAccountId,
			credentialId,
			keyId
		};
	}
});

export const rotateCredential = mutation({
	args: {
		organizationId: v.id('organizations'),
		serviceAccountId: v.id('developerServiceAccounts'),
		keyId: v.string(),
		publicJwk: v.any(),
		expiresAt: v.optional(v.number()),
		revokeCredentialId: v.optional(v.id('developerCredentials'))
	},
	returns: v.object({ credentialId: v.id('developerCredentials'), keyId: v.string() }),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'org:manage');
		const account = await ctx.db.get(args.serviceAccountId);
		assertOrgScoped(account, args.organizationId);
		if (account.status !== 'active') throw new Error('Service account is revoked.');
		const keyId = normalizeCredentialKeyId(args.keyId);
		const existing = await ctx.db
			.query('developerCredentials')
			.withIndex('by_key_id', (q) => q.eq('keyId', keyId))
			.unique();
		if (existing) throw new Error('Credential key ID is already registered.');
		const now = Date.now();
		const credentialId = await ctx.db.insert('developerCredentials', {
			organizationId: args.organizationId,
			serviceAccountId: account._id,
			keyId,
			algorithm: 'ES256',
			publicJwk: canonicalizePublicJwk(args.publicJwk),
			status: 'active',
			createdAt: now,
			expiresAt: validateExpiry(args.expiresAt)
		});
		if (args.revokeCredentialId) {
			const previous = await ctx.db.get(args.revokeCredentialId);
			assertOrgScoped(previous, args.organizationId);
			if (previous.serviceAccountId !== account._id) throw new Error('Credential not found.');
			await ctx.db.patch(previous._id, { status: 'revoked', revokedAt: now });
		}
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'developer.credential_rotated',
			resourceType: 'developerCredential',
			resourceId: String(credentialId),
			correlationId: `developer-account:${account._id}`,
			metadata: { keyId, replacedCredentialId: args.revokeCredentialId }
		});
		return { credentialId, keyId };
	}
});

export const revokeCredential = mutation({
	args: { organizationId: v.id('organizations'), credentialId: v.id('developerCredentials') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'org:manage');
		const credential = await ctx.db.get(args.credentialId);
		assertOrgScoped(credential, args.organizationId);
		if (credential.status === 'active') {
			await ctx.db.patch(credential._id, { status: 'revoked', revokedAt: Date.now() });
			await appendAudit(ctx, {
				organizationId: args.organizationId,
				actorType: 'user',
				actorId: user.privyDid,
				action: 'developer.credential_revoked',
				resourceType: 'developerCredential',
				resourceId: String(credential._id),
				correlationId: `developer-account:${credential.serviceAccountId}`,
				metadata: { keyId: credential.keyId }
			});
		}
		return null;
	}
});

export const revoke = mutation({
	args: {
		organizationId: v.id('organizations'),
		serviceAccountId: v.id('developerServiceAccounts')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'org:manage');
		const account = await ctx.db.get(args.serviceAccountId);
		assertOrgScoped(account, args.organizationId);
		const now = Date.now();
		if (account.status === 'active') {
			await ctx.db.patch(account._id, { status: 'revoked', revokedAt: now });
			const credentials = await ctx.db
				.query('developerCredentials')
				.withIndex('by_account', (q) => q.eq('serviceAccountId', account._id))
				.take(100);
			for (const credential of credentials) {
				if (credential.status === 'active')
					await ctx.db.patch(credential._id, { status: 'revoked', revokedAt: now });
			}
			await appendAudit(ctx, {
				organizationId: args.organizationId,
				actorType: 'user',
				actorId: user.privyDid,
				action: 'developer.service_account_revoked',
				resourceType: 'developerServiceAccount',
				resourceId: String(account._id),
				correlationId: `developer-account:${account._id}`
			});
		}
		return null;
	}
});

export const listRequestLogs = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'org:manage');
		return ctx.db
			.query('developerApiRequests')
			.withIndex('by_org_time', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(100);
	}
});
