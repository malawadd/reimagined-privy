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
		purpose: v.optional(v.union(v.literal('treasury'), v.literal('collection'))),
		invoiceId: v.optional(v.id('invoices')),
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
		const walletId = await ctx.runMutation(internal.operationState.saveWallet, {
			organizationId: args.organizationId,
			name: args.name,
			ownerQuorumId: args.ownerQuorumId,
			ownerPolicyId: args.ownerPolicyId,
			automationSignerId: args.automationSignerId,
			automationPolicyId: args.automationPolicyId,
			purpose: args.purpose,
			invoiceId: args.invoiceId,
			correlationId: args.correlationId,
			actorId: args.actorId,
			provider
		});
		const balance = await createPrivyGateway().getWalletBalance(
			String((provider as { id: unknown }).id)
		);
		await ctx.runMutation(internal.walletBalanceState.save, {
			organizationId: args.organizationId,
			walletId,
			provider: balance
		});
		return walletId;
	}
});

export const provisionInvoiceCollection = internalAction({
	args: {
		organizationId: v.id('organizations'),
		invoiceId: v.id('invoices'),
		name: v.string(),
		ownerQuorumId: v.string(),
		ownerPolicyId: v.string(),
		automationSignerId: v.string(),
		automationPolicyId: v.string(),
		servicePrincipalId: v.id('servicePrincipals'),
		treasuryDestination: v.string(),
		actorId: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const correlationId = `invoice-wallet:${args.invoiceId}`;
		try {
			const gateway = createPrivyGateway();
			const provider = await gateway.provisionTreasury({
				ownerId: args.ownerQuorumId,
				name: args.name,
				ownerPolicyId: args.ownerPolicyId,
				automationSigner: {
					signerId: args.automationSignerId,
					overridePolicyId: args.automationPolicyId
				},
				idempotencyKey: correlationId
			});
			const walletId = await ctx.runMutation(internal.operationState.saveWallet, {
				organizationId: args.organizationId,
				name: args.name,
				ownerQuorumId: args.ownerQuorumId,
				ownerPolicyId: args.ownerPolicyId,
				automationSignerId: args.automationSignerId,
				automationPolicyId: args.automationPolicyId,
				purpose: 'collection',
				invoiceId: args.invoiceId,
				correlationId,
				actorId: args.actorId,
				provider
			});
			const balance = await gateway.getWalletBalance(String((provider as { id: unknown }).id));
			await ctx.runMutation(internal.walletBalanceState.save, {
				organizationId: args.organizationId,
				walletId,
				provider: balance
			});
			await ctx.runMutation(internal.invoiceState.attachCollectionWallet, {
				invoiceId: args.invoiceId,
				walletId,
				servicePrincipalId: args.servicePrincipalId,
				treasuryDestination: args.treasuryDestination
			});
		} catch (error) {
			await ctx.runMutation(internal.invoiceState.markProvisioningFailed, {
				invoiceId: args.invoiceId,
				reason: error instanceof Error ? error.message : 'provider_error'
			});
		}
		return null;
	}
});
export const createPolicy = internalAction({
	args: {
		organizationId: v.id('organizations'),
		name: v.string(),
		kind: v.union(v.literal('owner'), v.literal('signerOverride'), v.literal('sweep')),
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
			kind: args.kind,
			json: args.json,
			correlationId: args.correlationId,
			actorId: args.actorId,
			provider
		});
	}
});
export const requestWalletUpdate = internalAction({
	args: { operationId: v.id('operations'), privyWalletId: v.string(), update: v.any() },
	returns: v.null(),
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
		return null;
	}
});
export const requestPolicyUpdate = internalAction({
	args: { operationId: v.id('operations'), privyPolicyId: v.string(), update: v.any() },
	returns: v.null(),
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
		return null;
	}
});
export const executePayment = internalAction({
	args: { operationId: v.id('operations') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const bundle = await ctx.runQuery(internal.privyData.getOperationBundle, {
			operationId: args.operationId
		});
		const operation = bundle.operation;
		if (operation.status !== 'queued') return null;
		if (!bundle.wallet) {
			await ctx.runMutation(internal.operationState.updateOperationStatus, {
				operationId: args.operationId,
				status: 'failed',
				errorCode: 'source_wallet_missing'
			});
			return null;
		}
		let providerCallStarted = false;
		try {
			if (operation.approvalPath === 'automationSigner') {
				const key = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY;
				if (!key) throw new Error('automation_signer_not_configured');
				const gateway = createPrivyGateway();
				await ctx.runMutation(internal.operationState.updateOperationStatus, {
					operationId: args.operationId,
					status: 'executing'
				});
				providerCallStarted = true;
				const provider = await gateway.transfer({
					walletId: bundle.wallet.privyWalletId,
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
				const gateway = createPrivyGateway();
				providerCallStarted = true;
				const provider = await gateway.createTransferIntent({
					walletId: bundle.wallet.privyWalletId,
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
				status: providerCallStarted
					? operation.approvalPath === 'automationSigner'
						? 'pendingConfirmation'
						: 'pendingApproval'
					: 'failed',
				errorCode: providerCallStarted
					? 'provider_result_ambiguous'
					: error instanceof Error
						? error.message
						: 'provider_configuration_error'
			});
		}
		return null;
	}
});
export const executeAutomationRun = internalAction({
	args: { runId: v.id('automationRuns') },
	returns: v.null(),
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
		return null;
	}
});
export const syncWallet = internalAction({
	args: { walletId: v.id('wallets'), privyWalletId: v.string() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const gateway = createPrivyGateway();
		const [provider, balance] = await Promise.all([
			gateway.getWallet(args.privyWalletId),
			gateway.getWalletBalance(args.privyWalletId)
		]);
		await ctx.runMutation(internal.operationState.updateWalletSync, {
			walletId: args.walletId,
			provider
		});
		const wallet = await ctx.runQuery(internal.privyData.getWallet, { walletId: args.walletId });
		if (wallet)
			await ctx.runMutation(internal.walletBalanceState.save, {
				organizationId: wallet.organizationId,
				walletId: wallet._id,
				provider: balance
			});
		return null;
	}
});

export const refreshWalletBalance = internalAction({
	args: {
		organizationId: v.id('organizations'),
		walletId: v.id('wallets'),
		privyWalletId: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const provider = await createPrivyGateway().getWalletBalance(args.privyWalletId);
		await ctx.runMutation(internal.walletBalanceState.save, {
			organizationId: args.organizationId,
			walletId: args.walletId,
			provider
		});
		return null;
	}
});
export const reconcileOperation = internalAction({
	args: { operationId: v.id('operations') },
	returns: v.null(),
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
		return null;
	}
});
export const reconcilePending = internalAction({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const pending = await ctx.runQuery(internal.privyData.listPending, {});
		for (const operation of pending.operations)
			await ctx.scheduler.runAfter(0, internal.privyActions.reconcileOperation, {
				operationId: operation._id
			});
		return null;
	}
});
