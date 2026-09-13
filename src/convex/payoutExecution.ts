'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { providerResourceId } from '../lib/privy';
import { assertAutomationExecutionBinding } from '../lib/payout-domain';
import { isDefinitiveProviderRejection, providerErrorCode } from '../lib/provider-errors';
import { createPrivyGateway } from './privy/gateway';

export const execute = internalAction({
	args: { attemptId: v.id('providerAttempts') },
	returns: v.null(),
	handler: async (ctx, args) => {
		let bundle;
		try {
			bundle = await ctx.runQuery(internal.payoutAttemptState.getBundle, args);
		} catch (error) {
			await ctx.runMutation(internal.payoutAttemptState.markFailed, {
				attemptId: args.attemptId,
				errorCode: providerErrorCode(error)
			});
			return null;
		}
		if (bundle.attempt.status !== 'claimed' || bundle.operation.status !== 'queued') return null;
		let providerCallStarted = false;
		try {
			const { asset, amount, destination } = bundle.operation;
			if (!asset || !amount || !destination) throw new Error('payout_operation_incomplete');
			if (bundle.operation.approvalPath === 'automationSigner') {
				const key = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY;
				const keyId = process.env.PRIVY_AUTHORIZATION_KEY_ID;
				if (!key || !keyId) throw new Error('automation_signer_not_configured');
				assertAutomationExecutionBinding({
					organizationActive: bundle.organization.active,
					organizationId: bundle.operation.organizationId,
					keyId,
					principals: bundle.principals,
					walletOrganizationId: bundle.wallet.organizationId,
					walletChainId: bundle.wallet.chainId,
					walletSignerIds: bundle.wallet.signerIds,
					walletPolicyIds: bundle.wallet.policyIds,
					policies: bundle.policies,
					asset,
					amount,
					destination
				});
				await ctx.runMutation(internal.payoutAttemptState.markProviderStarted, {
					attemptId: bundle.attempt._id
				});
				providerCallStarted = true;
				await ctx.runMutation(internal.operationState.updateOperationStatus, {
					operationId: bundle.operation._id,
					status: 'executing'
				});
				const provider = await createPrivyGateway().transfer({
					walletId: bundle.wallet.privyWalletId,
					asset,
					amount,
					destination,
					idempotencyKey: bundle.attempt.attemptKey,
					authorizationPrivateKey: key
				});
				await ctx.runMutation(internal.operationState.saveWalletAction, {
					operationId: bundle.operation._id,
					provider,
					providerReferenceId: bundle.attempt.attemptKey
				});
				await ctx.runMutation(internal.payoutAttemptState.markSubmitted, {
					attemptId: bundle.attempt._id,
					providerReferenceId: providerResourceId(provider as Record<string, unknown>)
				});
			} else {
				await ctx.runMutation(internal.payoutAttemptState.markProviderStarted, {
					attemptId: bundle.attempt._id
				});
				providerCallStarted = true;
				const provider = await createPrivyGateway().createTransferIntent({
					walletId: bundle.wallet.privyWalletId,
					asset,
					amount,
					destination,
					idempotencyKey: bundle.attempt.attemptKey
				});
				await ctx.runMutation(internal.operationState.saveIntent, {
					operationId: bundle.operation._id,
					provider,
					type: 'TRANSFER'
				});
				await ctx.runMutation(internal.payoutAttemptState.markSubmitted, {
					attemptId: bundle.attempt._id,
					providerReferenceId: providerResourceId(provider as Record<string, unknown>)
				});
			}
		} catch (error) {
			const errorCode = providerErrorCode(error);
			await ctx.runMutation(
				providerCallStarted && !isDefinitiveProviderRejection(error)
					? internal.payoutAttemptState.markAmbiguous
					: internal.payoutAttemptState.markFailed,
				{ attemptId: bundle.attempt._id, errorCode }
			);
		}
		return null;
	}
});
