import { v } from 'convex/values';
import { mutation, query, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { assertOrgScoped, requireMembership } from './lib/authz';
import { appendAudit } from './lib/audit';
import { getAddress } from 'viem';
import type { GenericMutationCtx } from 'convex/server';
import type { DataModel, Id } from './_generated/dataModel';

export const listProfiles = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'team:read');
		const memberships = await ctx.db
			.query('memberships')
			.withIndex('by_org_user', (q) => q.eq('organizationId', args.organizationId))
			.take(500);
		return Promise.all(
			memberships.map(async (membership) => {
				const [user, profile, personalWallet] = await Promise.all([
					ctx.db.get(membership.userId),
					ctx.db
						.query('payrollProfiles')
						.withIndex('by_org_user', (q) =>
							q.eq('organizationId', args.organizationId).eq('userId', membership.userId)
						)
						.unique(),
					ctx.db
						.query('personalWallets')
						.withIndex('by_org_user', (q) =>
							q.eq('organizationId', args.organizationId).eq('userId', membership.userId)
						)
						.unique()
				]);
				return {
					membershipId: membership._id,
					membershipStatus: membership.status,
					user,
					profile,
					personalWallet
				};
			})
		);
	}
});

export const syncPersonalWallet = mutation({
	args: { organizationId: v.id('organizations') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const { identity } = await requireMembership(ctx, args.organizationId);
		await ctx.scheduler.runAfter(0, internal.personalWalletActions.discover, {
			organizationId: args.organizationId,
			privyDid: identity.subject
		});
		return null;
	}
});

export const organizationWalletIds = internalQuery({
	args: { organizationId: v.id('organizations') },
	returns: v.array(v.string()),
	handler: async (ctx, args) => {
		const wallets = await ctx.db
			.query('wallets')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.take(500);
		return wallets.map((wallet) => wallet.privyWalletId);
	}
});

export const savePersonalWallet = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		privyDid: v.string(),
		privyWalletId: v.string(),
		address: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query('users')
			.withIndex('by_privy_did', (q) => q.eq('privyDid', args.privyDid))
			.unique();
		if (!user) throw new Error('User not found.');
		const membership = await ctx.db
			.query('memberships')
			.withIndex('by_org_user', (q) =>
				q.eq('organizationId', args.organizationId).eq('userId', user._id)
			)
			.unique();
		if (!membership || membership.status !== 'active')
			throw new Error('Organization access denied.');
		const organizationWallets = await ctx.db
			.query('wallets')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.take(500);
		if (organizationWallets.some((wallet) => wallet.privyWalletId === args.privyWalletId))
			throw new Error('An organization treasury cannot be used as a personal payout wallet.');
		const address = getAddress(args.address);
		const verifiedAt = Date.now();
		let wallet = await ctx.db
			.query('personalWallets')
			.withIndex('by_org_user', (q) =>
				q.eq('organizationId', args.organizationId).eq('userId', user._id)
			)
			.unique();
		if (wallet)
			await ctx.db.patch(wallet._id, {
				privyWalletId: args.privyWalletId,
				address,
				verifiedAt,
				updatedAt: verifiedAt
			});
		else {
			const walletId = await ctx.db.insert('personalWallets', {
				organizationId: args.organizationId,
				userId: user._id,
				privyWalletId: args.privyWalletId,
				address,
				chainId: 84532,
				verifiedAt,
				updatedAt: verifiedAt
			});
			wallet = await ctx.db.get(walletId);
		}
		const profile = await ctx.db
			.query('payrollProfiles')
			.withIndex('by_org_user', (q) =>
				q.eq('organizationId', args.organizationId).eq('userId', user._id)
			)
			.unique();
		if (profile)
			await ctx.db.patch(profile._id, {
				destinationKind: 'personal',
				personalWalletId: wallet!._id,
				externalAddress: undefined,
				externalVerifiedAt: undefined,
				updatedAt: Date.now()
			});
		else
			await ctx.db.insert('payrollProfiles', {
				organizationId: args.organizationId,
				userId: user._id,
				eligibility: 'active',
				destinationKind: 'personal',
				personalWalletId: wallet!._id,
				updatedAt: Date.now()
			});
		await recordDestinationVersion(ctx, {
			organizationId: args.organizationId,
			userId: user._id,
			kind: 'personal',
			address,
			personalWalletId: wallet!._id,
			verifiedAt
		});
		return null;
	}
});

export const createExternalChallenge = mutation({
	args: { organizationId: v.id('organizations'), address: v.string() },
	returns: v.object({ challengeId: v.id('walletVerificationChallenges'), message: v.string() }),
	handler: async (ctx, args) => {
		const { user, organization } = await requireMembership(ctx, args.organizationId);
		const address = getAddress(args.address);
		const nonce = crypto.randomUUID();
		const message = `Ratib salary wallet verification\nOrganization: ${organization.name}\nMember: ${user.privyDid}\nAddress: ${address}\nNetwork: eip155:84532\nNonce: ${nonce}`;
		const nonceHash = await sha256(nonce);
		const challengeId = await ctx.db.insert('walletVerificationChallenges', {
			organizationId: args.organizationId,
			userId: user._id,
			address,
			nonceHash,
			message,
			expiresAt: Date.now() + 10 * 60_000
		});
		return { challengeId, message };
	}
});

export const getExternalVerificationContext = internalQuery({
	args: {
		organizationId: v.id('organizations'),
		challengeId: v.id('walletVerificationChallenges'),
		privyDid: v.string()
	},
	returns: v.object({ address: v.string(), message: v.string() }),
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query('users')
			.withIndex('by_privy_did', (q) => q.eq('privyDid', args.privyDid))
			.unique();
		if (!user) throw new Error('Organization access denied.');
		const membership = await ctx.db
			.query('memberships')
			.withIndex('by_org_user', (q) =>
				q.eq('organizationId', args.organizationId).eq('userId', user._id)
			)
			.unique();
		if (!membership || membership.status !== 'active')
			throw new Error('Organization access denied.');
		const challenge = await ctx.db.get(args.challengeId);
		assertOrgScoped(challenge, args.organizationId);
		if (challenge.userId !== user._id || challenge.usedAt || challenge.expiresAt <= Date.now())
			throw new Error('Wallet verification challenge is invalid or expired.');
		return { address: challenge.address, message: challenge.message };
	}
});

export const commitExternalDestination = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		challengeId: v.id('walletVerificationChallenges'),
		privyDid: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query('users')
			.withIndex('by_privy_did', (q) => q.eq('privyDid', args.privyDid))
			.unique();
		if (!user) throw new Error('Organization access denied.');
		const membership = await ctx.db
			.query('memberships')
			.withIndex('by_org_user', (q) =>
				q.eq('organizationId', args.organizationId).eq('userId', user._id)
			)
			.unique();
		if (!membership || membership.status !== 'active')
			throw new Error('Organization access denied.');
		const challenge = await ctx.db.get(args.challengeId);
		assertOrgScoped(challenge, args.organizationId);
		if (challenge.userId !== user._id || challenge.usedAt || challenge.expiresAt <= Date.now())
			throw new Error('Wallet verification challenge is invalid or expired.');
		await ctx.db.patch(challenge._id, { usedAt: Date.now() });
		const profile = await ctx.db
			.query('payrollProfiles')
			.withIndex('by_org_user', (q) =>
				q.eq('organizationId', args.organizationId).eq('userId', user._id)
			)
			.unique();
		const verifiedAt = Date.now();
		if (profile)
			await ctx.db.patch(profile._id, {
				destinationKind: 'external',
				personalWalletId: undefined,
				externalAddress: challenge.address,
				externalVerifiedAt: verifiedAt,
				updatedAt: Date.now()
			});
		else
			await ctx.db.insert('payrollProfiles', {
				organizationId: args.organizationId,
				userId: user._id,
				eligibility: 'active',
				destinationKind: 'external',
				externalAddress: challenge.address,
				externalVerifiedAt: verifiedAt,
				updatedAt: Date.now()
			});
		await recordDestinationVersion(ctx, {
			organizationId: args.organizationId,
			userId: user._id,
			kind: 'external',
			address: challenge.address,
			verifiedAt
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'payroll.destination_verified',
			resourceType: 'payrollProfile',
			resourceId: profile?._id ?? user._id,
			correlationId: `payout:${user._id}:${Date.now()}`,
			metadata: { address: challenge.address }
		});
		return null;
	}
});

export const setEligibility = mutation({
	args: {
		organizationId: v.id('organizations'),
		membershipId: v.id('memberships'),
		eligibility: v.union(v.literal('active'), v.literal('paused'))
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'team:manage');
		const membership = await ctx.db.get(args.membershipId);
		assertOrgScoped(membership, args.organizationId);
		const profile = await ctx.db
			.query('payrollProfiles')
			.withIndex('by_org_user', (q) =>
				q.eq('organizationId', args.organizationId).eq('userId', membership.userId)
			)
			.unique();
		if (profile)
			await ctx.db.patch(profile._id, { eligibility: args.eligibility, updatedAt: Date.now() });
		else
			await ctx.db.insert('payrollProfiles', {
				organizationId: args.organizationId,
				userId: membership.userId,
				eligibility: args.eligibility,
				updatedAt: Date.now()
			});
		return null;
	}
});

async function sha256(value: string) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

async function recordDestinationVersion(
	ctx: GenericMutationCtx<DataModel>,
	input: {
		organizationId: Id<'organizations'>;
		userId: Id<'users'>;
		kind: 'personal' | 'external';
		address: string;
		personalWalletId?: Id<'personalWallets'>;
		verifiedAt: number;
	}
) {
	const versions = await ctx.db
		.query('payoutDestinationVersions')
		.withIndex('by_org_user', (q) =>
			q.eq('organizationId', input.organizationId).eq('userId', input.userId)
		)
		.take(100);
	for (const version of versions)
		if (version.status === 'active') await ctx.db.patch(version._id, { status: 'superseded' });
	await ctx.db.insert('payoutDestinationVersions', {
		...input,
		version: Math.max(0, ...versions.map((version) => version.version)) + 1,
		status: 'active',
		createdAt: Date.now()
	});
}
