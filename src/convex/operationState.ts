import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { monotonicStatus } from '../lib/domain';
import {
	providerIntentProgress,
	providerIntentType,
	providerOperationStatus,
	providerResourceId
} from '../lib/privy';
import { appendAudit } from './lib/audit';

export const saveWallet = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		name: v.string(),
		ownerQuorumId: v.string(),
		ownerPolicyId: v.string(),
		automationSignerId: v.optional(v.string()),
		automationPolicyId: v.optional(v.string()),
		provider: v.any(),
		correlationId: v.string(),
		actorId: v.string()
	},
	handler: async (ctx, args) => {
		const provider = args.provider as Record<string, unknown>;
		const privyWalletId = String(provider.id);
		const address = String(provider.address);
		const existing = await ctx.db
			.query('wallets')
			.withIndex('by_privy_id', (q) => q.eq('privyWalletId', privyWalletId))
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, {
				address,
				syncVersion: existing.syncVersion + 1,
				syncedAt: Date.now()
			});
			return existing._id;
		}
		const walletId = await ctx.db.insert('wallets', {
			organizationId: args.organizationId,
			privyWalletId,
			name: args.name,
			address,
			chainType: 'ethereum',
			chainId: 84532,
			ownerQuorumId: args.ownerQuorumId,
			signerIds: args.automationSignerId ? [args.automationSignerId] : [],
			policyIds: [
				args.ownerPolicyId,
				...(args.automationPolicyId ? [args.automationPolicyId] : [])
			],
			syncVersion: 1,
			syncedAt: Date.now()
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: args.actorId,
			action: 'wallet.provisioned',
			resourceType: 'wallet',
			resourceId: walletId,
			correlationId: args.correlationId,
			privyIds: [privyWalletId],
			metadata: { address }
		});
		return walletId;
	}
});
export const savePolicy = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		name: v.string(),
		provider: v.any(),
		correlationId: v.string(),
		actorId: v.string(),
		json: v.any()
	},
	handler: async (ctx, args) => {
		const provider = args.provider as Record<string, unknown>;
		const id = String(provider.id);
		const policyId = await ctx.db.insert('policies', {
			organizationId: args.organizationId,
			privyPolicyId: id,
			name: args.name,
			version: 1,
			kind: 'owner',
			json: args.json,
			status: 'active',
			createdAt: Date.now()
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: args.actorId,
			action: 'policy.created',
			resourceType: 'policy',
			resourceId: policyId,
			correlationId: args.correlationId,
			privyIds: [id]
		});
		return policyId;
	}
});
export const saveIntent = internalMutation({
	args: { operationId: v.id('operations'), provider: v.any(), type: v.string() },
	handler: async (ctx, args) => {
		const operation = await ctx.db.get(args.operationId);
		if (!operation) throw new Error('Operation not found.');
		const provider = args.provider as Record<string, unknown>;
		const id = providerResourceId(provider);
		const progress = providerIntentProgress(provider);
		await ctx.db.insert('intentSnapshots', {
			organizationId: operation.organizationId,
			operationId: operation._id,
			privyIntentId: id,
			type: providerIntentType(provider, args.type),
			status: String(provider.status ?? 'pending'),
			approvals: progress.approvals,
			threshold: progress.threshold,
			expiresAt: typeof provider.expires_at === 'number' ? provider.expires_at : undefined,
			providerUpdatedAt: Date.now(),
			raw: provider
		});
		await ctx.db.patch(operation._id, { status: 'pendingApproval', updatedAt: Date.now() });
		await appendAudit(ctx, {
			organizationId: operation.organizationId,
			actorType: 'system',
			actorId: 'convex',
			action: 'privy.intent_created',
			resourceType: 'operation',
			resourceId: operation._id,
			correlationId: operation.correlationId,
			privyIds: [id]
		});
	}
});
export const saveWalletAction = internalMutation({
	args: {
		operationId: v.id('operations'),
		provider: v.any(),
		providerReferenceId: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const operation = await ctx.db.get(args.operationId);
		if (!operation) throw new Error('Operation not found.');
		const provider = args.provider as Record<string, unknown>;
		const id = String(provider.id);
		await ctx.db.insert('walletActionSnapshots', {
			organizationId: operation.organizationId,
			operationId: operation._id,
			privyWalletActionId: id,
			status: String(provider.status ?? 'pending'),
			providerReferenceId: args.providerReferenceId,
			providerUpdatedAt: Date.now(),
			raw: provider
		});
		await ctx.db.patch(operation._id, { status: 'pendingConfirmation', updatedAt: Date.now() });
	}
});
export const updateOperationStatus = internalMutation({
	args: {
		operationId: v.id('operations'),
		status: v.union(
			v.literal('draft'),
			v.literal('queued'),
			v.literal('pendingApproval'),
			v.literal('executing'),
			v.literal('pendingConfirmation'),
			v.literal('succeeded'),
			v.literal('rejected'),
			v.literal('expired'),
			v.literal('failed'),
			v.literal('cancelled')
		),
		errorCode: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const operation = await ctx.db.get(args.operationId);
		if (!operation) return;
		const status = monotonicStatus(operation.status, args.status);
		await ctx.db.patch(args.operationId, {
			status,
			errorCode: args.errorCode,
			updatedAt: Date.now()
		});
	}
});

export const applyProviderState = internalMutation({
	args: {
		operationId: v.id('operations'),
		provider: v.any(),
		source: v.union(v.literal('webhook'), v.literal('reconciliation'))
	},
	handler: async (ctx, args) => {
		const operation = await ctx.db.get(args.operationId);
		if (!operation) return;
		const provider = args.provider as Record<string, unknown>;
		const providerStatus = String(provider.status ?? '').toLowerCase();
		const mapped = providerOperationStatus(provider);
		if (!mapped) return;
		const status = monotonicStatus(operation.status, mapped);
		await ctx.db.patch(operation._id, { status, updatedAt: Date.now() });
		await appendAudit(ctx, {
			organizationId: operation.organizationId,
			actorType: args.source === 'webhook' ? 'privy' : 'system',
			actorId: args.source === 'webhook' ? 'privy-webhook' : 'reconciler',
			action: `operation.${status}`,
			resourceType: 'operation',
			resourceId: operation._id,
			correlationId: operation.correlationId,
			privyIds: typeof provider.id === 'string' ? [provider.id] : [],
			transactionHash:
				typeof provider.transaction_hash === 'string' ? provider.transaction_hash : undefined,
			metadata: { providerStatus, source: args.source }
		});
	}
});
export const markRun = internalMutation({
	args: {
		runId: v.id('automationRuns'),
		status: v.union(
			v.literal('submitted'),
			v.literal('succeeded'),
			v.literal('failed'),
			v.literal('ambiguous')
		),
		operationId: v.optional(v.id('operations'))
	},
	handler: (ctx, args) =>
		ctx.db.patch(args.runId, {
			status: args.status,
			operationId: args.operationId,
			updatedAt: Date.now()
		})
});
export const updateWalletSync = internalMutation({
	args: { walletId: v.id('wallets'), provider: v.any() },
	handler: async (ctx, args) => {
		const wallet = await ctx.db.get(args.walletId);
		if (!wallet) return;
		const provider = args.provider as Record<string, unknown>;
		await ctx.db.patch(args.walletId, {
			address: String(provider.address ?? wallet.address),
			syncVersion: wallet.syncVersion + 1,
			syncedAt: Date.now()
		});
	}
});
