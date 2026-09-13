import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { assertOrgScoped, requireMembership } from './lib/authz';
import { appendAudit } from './lib/audit';

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		const runs = await ctx.db
			.query('provisioningRuns')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(100);
		return runs.filter(
			(run) =>
				run.status === 'succeeded' ||
				!runs.some(
					(candidate) =>
						candidate.status === 'succeeded' &&
						candidate.walletName === run.walletName &&
						candidate._creationTime > run._creationTime
				)
		);
	}
});

export const retry = mutation({
	args: { organizationId: v.id('organizations'), provisioningRunId: v.id('provisioningRuns') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'wallet:manage');
		const run = await ctx.db.get(args.provisioningRunId);
		assertOrgScoped(run, args.organizationId);
		if (run.status === 'succeeded') return null;
		if (
			run.status === 'ambiguous' &&
			!run.privyQuorumId &&
			!isDefinitiveProviderErrorCode(run.errorCode)
		)
			throw new Error(
				'The quorum creation response is ambiguous. Ratib will not create a duplicate authority group; reconcile this provider reference first.'
			);
		if (!['failed', 'ambiguous'].includes(run.status))
			throw new Error('This provisioning run is already active.');
		await ctx.db.patch(run._id, { status: 'pending', errorCode: undefined, updatedAt: Date.now() });
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'provisioning.retry_requested',
			resourceType: 'provisioningRun',
			resourceId: run._id,
			correlationId: run.runKey
		});
		await ctx.scheduler.runAfter(0, internal.provisioningActions.execute, {
			provisioningRunId: run._id
		});
		return null;
	}
});

function isDefinitiveProviderErrorCode(errorCode?: string) {
	const match = /^privy_http_(\d{3})$/.exec(errorCode ?? '');
	if (!match) return false;
	const status = Number(match[1]);
	return status >= 400 && status < 500;
}

export const claim = internalMutation({
	args: { provisioningRunId: v.id('provisioningRuns') },
	returns: v.any(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.provisioningRunId);
		if (!run || run.status === 'succeeded') return null;
		if (run.status === 'ambiguous' && !run.privyQuorumId) return null;
		if (run.status === 'claimed' && run.claimedAt && Date.now() - run.claimedAt < 5 * 60_000)
			return null;
		const requester = await ctx.db.get(run.requestedBy);
		if (!requester) throw new Error('Provisioning requester not found.');
		await ctx.db.patch(run._id, {
			status: 'claimed',
			claimedAt: Date.now(),
			errorCode: undefined,
			updatedAt: Date.now()
		});
		return { run, requester };
	}
});

export const recordQuorum = internalMutation({
	args: { provisioningRunId: v.id('provisioningRuns'), privyQuorumId: v.string() },
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.provisioningRunId, {
			privyQuorumId: args.privyQuorumId,
			status: 'quorumCreated',
			updatedAt: Date.now()
		});
		return null;
	}
});

export const recordPolicy = internalMutation({
	args: {
		provisioningRunId: v.id('provisioningRuns'),
		privyPolicyId: v.string(),
		policyJson: v.any()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.provisioningRunId);
		if (!run) return null;
		const existing = await ctx.db
			.query('policies')
			.withIndex('by_privy_id', (q) => q.eq('privyPolicyId', args.privyPolicyId))
			.unique();
		if (!existing)
			await ctx.db.insert('policies', {
				organizationId: run.organizationId,
				privyPolicyId: args.privyPolicyId,
				name: String((args.policyJson as { name?: string }).name ?? 'Base Sepolia controls'),
				version: 1,
				kind: 'owner',
				json: args.policyJson,
				status: 'active',
				createdAt: Date.now()
			});
		await ctx.db.patch(run._id, {
			privyPolicyId: args.privyPolicyId,
			status: 'policyCreated',
			updatedAt: Date.now()
		});
		return null;
	}
});

export const complete = internalMutation({
	args: {
		provisioningRunId: v.id('provisioningRuns'),
		provider: v.any(),
		automationSignerId: v.optional(v.string())
	},
	returns: v.id('wallets'),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.provisioningRunId);
		if (!run?.privyQuorumId || !run.privyPolicyId)
			throw new Error('Provisioning prerequisites are incomplete.');
		const provider = args.provider as { id: string; address: string };
		let wallet = await ctx.db
			.query('wallets')
			.withIndex('by_privy_id', (q) => q.eq('privyWalletId', String(provider.id)))
			.unique();
		if (!wallet) {
			const walletId = await ctx.db.insert('wallets', {
				organizationId: run.organizationId,
				privyWalletId: String(provider.id),
				name: run.walletName,
				address: String(provider.address),
				chainType: 'ethereum',
				chainId: 84532,
				ownerQuorumId: run.privyQuorumId,
				signerIds: [],
				policyIds: [run.privyPolicyId],
				approvalThreshold: 1,
				syncVersion: 1,
				syncedAt: Date.now(),
				purpose: run.purpose
			});
			wallet = await ctx.db.get(walletId);
		}
		if (!wallet) throw new Error('Wallet could not be persisted.');
		const assignment = await ctx.db
			.query('walletAssignments')
			.withIndex('by_wallet_user', (q) =>
				q.eq('walletId', wallet!._id).eq('userId', run.requestedBy)
			)
			.unique();
		if (!assignment)
			await ctx.db.insert('walletAssignments', {
				organizationId: run.organizationId,
				walletId: wallet._id,
				userId: run.requestedBy,
				permissions: ['view', 'initiate', 'approve', 'manage'],
				status: 'active',
				updatedAt: Date.now()
			});
		const requester = await ctx.db.get(run.requestedBy);
		const reviewer = await ctx.db
			.query('reviewerMembers')
			.withIndex('by_wallet_user', (q) =>
				q.eq('walletId', wallet!._id).eq('userId', run.requestedBy)
			)
			.unique();
		if (!reviewer && requester)
			await ctx.db.insert('reviewerMembers', {
				organizationId: run.organizationId,
				walletId: wallet._id,
				userId: requester._id,
				privyDid: requester.privyDid,
				status: 'active',
				updatedAt: Date.now()
			});
		const quorum = await ctx.db
			.query('reviewerQuorums')
			.withIndex('by_org', (q) => q.eq('organizationId', run.organizationId))
			.unique();
		if (!quorum)
			await ctx.db.insert('reviewerQuorums', {
				organizationId: run.organizationId,
				privyOwnerId: run.privyQuorumId,
				threshold: 1,
				reviewerCount: 1,
				mfaRequired: true,
				syncedAt: Date.now()
			});
		if (args.automationSignerId) {
			const principals = await ctx.db
				.query('servicePrincipals')
				.withIndex('by_org_status', (q) =>
					q.eq('organizationId', run.organizationId).eq('status', 'active')
				)
				.take(10);
			if (
				!principals.some(
					(principal) => principal.privyAuthorizationKeyId === args.automationSignerId
				)
			)
				await ctx.db.insert('servicePrincipals', {
					organizationId: run.organizationId,
					name: 'Ratib controlled automation',
					purpose: 'Policy-bounded Base Sepolia execution',
					privyAuthorizationKeyId: args.automationSignerId,
					status: 'active'
				});
		}
		await ctx.db.patch(run._id, {
			privyWalletId: String(provider.id),
			walletId: wallet._id,
			status: 'succeeded',
			updatedAt: Date.now()
		});
		await appendAudit(ctx, {
			organizationId: run.organizationId,
			actorType: 'system',
			actorId: 'convex',
			action: 'wallet.provisioned',
			resourceType: 'wallet',
			resourceId: wallet._id,
			correlationId: run.runKey,
			privyIds: [run.privyQuorumId, run.privyPolicyId, String(provider.id)],
			metadata: { network: 'eip155:84532', purpose: run.purpose }
		});
		return wallet._id;
	}
});

export const markProblem = internalMutation({
	args: {
		provisioningRunId: v.id('provisioningRuns'),
		status: v.union(v.literal('failed'), v.literal('ambiguous')),
		errorCode: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.provisioningRunId, {
			status: args.status,
			errorCode: args.errorCode.slice(0, 160),
			updatedAt: Date.now()
		});
		return null;
	}
});
