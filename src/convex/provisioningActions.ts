'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { createPrivyGateway } from './privy/gateway';
import { compileOwnerPolicy } from '../lib/policy';
import {
	privyKeyQuorumDisplayName,
	privyPolicyName,
	privyWalletExternalId
} from '../lib/wallet-controls';

export const execute = internalAction({
	args: { provisioningRunId: v.id('provisioningRuns') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const claimed = (await ctx.runMutation(internal.provisioning.claim, args)) as {
			run: {
				_id: typeof args.provisioningRunId;
				runKey: string;
				walletName: string;
				privyQuorumId?: string;
				privyPolicyId?: string;
			};
			requester: { privyDid: string };
		} | null;
		if (!claimed) return null;
		const { run, requester } = claimed;
		const gateway = createPrivyGateway();
		let quorumId = run.privyQuorumId;
		let policyId = run.privyPolicyId;
		try {
			if (!quorumId) {
				const quorum = (await gateway.createKeyQuorum({
					userIds: [requester.privyDid],
					threshold: 1,
					displayName: privyKeyQuorumDisplayName(run.walletName, run.runKey)
				})) as { id: string };
				quorumId = String(quorum.id);
				await ctx.runMutation(internal.provisioning.recordQuorum, {
					provisioningRunId: run._id,
					privyQuorumId: quorumId
				});
			}
			const policyJson = compileOwnerPolicy(privyPolicyName(run.walletName));
			if (!policyId) {
				const policy = (await gateway.createPolicy({
					...policyJson,
					owner_id: quorumId,
					idempotency_key: `${run.runKey}:policy`
				})) as { id: string };
				policyId = String(policy.id);
				await ctx.runMutation(internal.provisioning.recordPolicy, {
					provisioningRunId: run._id,
					privyPolicyId: policyId,
					policyJson
				});
			}
			const wallet = await gateway.provisionTreasury({
				ownerId: quorumId,
				name: run.walletName,
				ownerPolicyId: policyId,
				idempotencyKey: `${run.runKey}:wallet`,
				externalId: privyWalletExternalId(run.runKey)
			});
			await ctx.runMutation(internal.provisioning.complete, {
				provisioningRunId: run._id,
				provider: wallet
			});
		} catch (error) {
			const status = isDefinitiveProviderRejection(error) ? 'failed' : 'ambiguous';
			const code = providerErrorCode(error);
			await ctx.runMutation(internal.provisioning.markProblem, {
				provisioningRunId: run._id,
				status,
				errorCode: code
			});
		}
		return null;
	}
});

function providerErrorCode(error: unknown) {
	if (error && typeof error === 'object') {
		const candidate = error as { code?: unknown; status?: unknown };
		if (typeof candidate.code === 'string') return `privy:${candidate.code}`;
		if (typeof candidate.status === 'number') return `privy_http_${candidate.status}`;
	}
	return 'privy_response_unknown';
}

function isDefinitiveProviderRejection(error: unknown) {
	if (!error || typeof error !== 'object') return false;
	const status = (error as { status?: unknown }).status;
	return typeof status === 'number' && status >= 400 && status < 500;
}
