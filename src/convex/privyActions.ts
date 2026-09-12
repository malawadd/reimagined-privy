'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { createPrivyGateway } from './privy/gateway';

export const provisionWallet = internalAction({
	args: {
		organizationId: v.id('organizations'),
		name: v.string(),
		ownerQuorumId: v.string(),
		ownerPolicyId: v.string(),
		automationSignerId: v.optional(v.string()),
		automationPolicyId: v.optional(v.string()),
		correlationId: v.string(),
		actorId: v.string()
	},
	returns: v.any(),
	handler: async (ctx, args): Promise<unknown> => {
		const provider = await createPrivyGateway().provisionTreasury({
			ownerId: args.ownerQuorumId,
			name: args.name,
			ownerPolicyId: args.ownerPolicyId,
			automationSigner:
				args.automationSignerId && args.automationPolicyId
					? {
							signerId: args.automationSignerId,
							overridePolicyId: args.automationPolicyId
						}
					: undefined,
			idempotencyKey: args.correlationId
		});
		return ctx.runMutation(internal.operationState.saveWallet, {
			organizationId: args.organizationId,
			name: args.name,
			ownerQuorumId: args.ownerQuorumId,
			ownerPolicyId: args.ownerPolicyId,
			automationSignerId: args.automationSignerId,
			automationPolicyId: args.automationPolicyId,
			correlationId: args.correlationId,
			actorId: args.actorId,
			provider
		});
	}
});
export const createPolicy = internalAction({
	args: {
		organizationId: v.id('organizations'),
		name: v.string(),
		json: v.any(),
		ownerQuorumId: v.string(),
		correlationId: v.string(),
		actorId: v.string()
	},
	returns: v.any(),
	handler: async (ctx, args): Promise<unknown> => {
		const provider = await createPrivyGateway().createPolicy({
			...(args.json as object),
			owner_id: args.ownerQuorumId,
			idempotency_key: args.correlationId
		});
		return ctx.runMutation(internal.operationState.savePolicy, {
			organizationId: args.organizationId,
			name: args.name,
			json: args.json,
			correlationId: args.correlationId,
			actorId: args.actorId,
			provider
		});
	}
});
export const requestWalletUpdate = internalAction({
	args: { operationId: v.id('operations'), privyWalletId: v.string(), update: v.any() },
	handler: async (ctx, args) => {
		const provider = await createPrivyGateway().requestWalletUpdate(
			args.privyWalletId,
			args.update
		);
		await ctx.runMutation(internal.operationState.saveIntent, {
			operationId: args.operationId,
			provider,
			type: 'WALLET_UPDATE'
		});
	}
});
export const requestPolicyUpdate = internalAction({
	args: { operationId: v.id('operations'), privyPolicyId: v.string(), update: v.any() },
	handler: async (ctx, args) => {
		const provider = await createPrivyGateway().requestPolicyUpdate(
			args.privyPolicyId,
			args.update
		);
		await ctx.runMutation(internal.operationState.saveIntent, {
			operationId: args.operationId,
			provider,
			type: 'POLICY_UPDATE'
		});
	}
});
export const executePayment = internalAction({
	args: { operationId: v.id('operations'), privyWalletId: v.string() },
	handler: async (ctx, args) => {
		const bundle = await ctx.runQuery(internal.privyData.getOperationBundle, {
			operationId: args.operationId
		});
		const operation = bundle.operation;
		try {
			if (operation.approvalPath === 'automationSigner') {
				const key = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY;
				if (!key) throw new Error('automation_signer_not_configured');
				const provider = await createPrivyGateway().transfer({
					walletId: args.privyWalletId,
					asset: operation.asset!,
					amount: operation.amount!,
					destination: operation.destination!,
					idempotencyKey: operation.correlationId,
					authorizationPrivateKey: key
				});
				await ctx.runMutation(internal.operationState.saveWalletAction, {
					operationId: args.operationId,
					provider,
					providerReferenceId: operation.correlationId
				});
			} else {
				const provider = await createPrivyGateway().createTransferIntent({
					walletId: args.privyWalletId,
					asset: operation.asset!,
					amount: operation.amount!,
					destination: operation.destination!
				});
				await ctx.runMutation(internal.operationState.saveIntent, {
					operationId: args.operationId,
					provider,
					type: 'TRANSFER'
				});
			}
		} catch (error) {
			await ctx.runMutation(internal.operationState.updateOperationStatus, {
				operationId: args.operationId,
				status: 'failed',
				errorCode: error instanceof Error ? error.message : 'provider_error'
			});
		}
	}
});
export const executeAutomationRun = internalAction({
	args: { runId: v.id('automationRuns') },
	handler: async (ctx, args) => {
		const bundle = await ctx.runQuery(internal.privyData.getAutomationBundle, args);
		try {
			const amount = bundle.run.amount ?? bundle.automation.amount;
			if (!amount) throw new Error('automation_amount_missing');
			const operationId = await ctx.runMutation(internal.automationMaterialize.createOperation, {
				runId: args.runId
			});
			const key = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY;
			if (!key) throw new Error('automation_signer_not_configured');
			const provider = await createPrivyGateway().transfer({
				walletId: bundle.wallet.privyWalletId,
				asset: 'USDC',
				amount,
				destination: bundle.automation.destination,
				idempotencyKey: bundle.run.runKey,
				authorizationPrivateKey: key
			});
			await ctx.runMutation(internal.operationState.saveWalletAction, {
				operationId,
				provider,
				providerReferenceId: bundle.run.providerReferenceId
			});
			await ctx.runMutation(internal.operationState.markRun, {
				runId: args.runId,
				status: 'submitted',
				operationId
			});
		} catch {
			await ctx.runMutation(internal.operationState.markRun, {
				runId: args.runId,
				status: 'ambiguous'
			});
		}
	}
});
export const syncWallet = internalAction({
	args: { walletId: v.id('wallets'), privyWalletId: v.string() },
	handler: async (ctx, args) => {
		const provider = await createPrivyGateway().getWallet(args.privyWalletId);
		await ctx.runMutation(internal.operationState.updateWalletSync, {
			walletId: args.walletId,
			provider
		});
	}
});
export const reconcileOperation = internalAction({
	args: { operationId: v.id('operations') },
	handler: async (ctx, args) => {
		const bundle = await ctx.runQuery(internal.privyData.getOperationBundle, args);
		let provider: unknown = null;
		if (bundle.intent) provider = await createPrivyGateway().getIntent(bundle.intent.privyIntentId);
		else if (bundle.walletAction && bundle.wallet)
			provider = await createPrivyGateway().getWalletAction(
				bundle.wallet.privyWalletId,
				bundle.walletAction.privyWalletActionId
			);
		if (provider)
			await ctx.runMutation(internal.operationState.applyProviderState, {
				operationId: args.operationId,
				provider,
				source: 'reconciliation'
			});
	}
});
export const reconcilePending = internalAction({
	args: {},
	handler: async (ctx) => {
		const pending = await ctx.runQuery(internal.privyData.listPending, {});
		for (const operation of pending.operations)
			await ctx.scheduler.runAfter(0, internal.privyActions.reconcileOperation, {
				operationId: operation._id
			});
	}
});
