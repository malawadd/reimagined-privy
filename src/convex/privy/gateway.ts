'use node';

import { generateAuthorizationSignature, PrivyClient } from '@privy-io/node';
import { BASE_SEPOLIA } from '../../lib/domain';

export interface PrivyGateway {
	provisionTreasury(input: {
		ownerId: string;
		name: string;
		ownerPolicyId: string;
		automationSigner?: { signerId: string; overridePolicyId: string };
		idempotencyKey: string;
	}): Promise<unknown>;
	listWallets(): Promise<unknown[]>;
	getWallet(walletId: string): Promise<unknown>;
	getWalletBalance(walletId: string): Promise<unknown>;
	getPolicy(policyId: string): Promise<unknown>;
	createPolicy(input: Record<string, unknown> & { idempotency_key: string }): Promise<unknown>;
	transfer(input: {
		walletId: string;
		asset: 'ETH' | 'USDC';
		amount: string;
		destination: string;
		idempotencyKey: string;
		authorizationPrivateKey: string;
	}): Promise<unknown>;
	createTransferIntent(input: {
		walletId: string;
		asset: 'ETH' | 'USDC';
		amount: string;
		destination: string;
	}): Promise<unknown>;
	requestWalletUpdate(walletId: string, update: Record<string, unknown>): Promise<unknown>;
	requestPolicyUpdate(policyId: string, update: Record<string, unknown>): Promise<unknown>;
	getIntent(intentId: string): Promise<unknown>;
	listIntents(): Promise<unknown[]>;
	getWalletAction(walletId: string, actionId: string): Promise<unknown>;
}

export class LivePrivyGateway implements PrivyGateway {
	private client: PrivyClient;
	private appId: string;

	constructor(appId: string, appSecret: string) {
		this.appId = appId;
		this.client = new PrivyClient({
			appId,
			appSecret,
			requestExpiry: { defaultMs: 15 * 60 * 1000, defaultIntentMs: 71 * 60 * 60 * 1000 }
		});
	}

	async provisionTreasury(input: {
		ownerId: string;
		name: string;
		ownerPolicyId: string;
		automationSigner?: { signerId: string; overridePolicyId: string };
		idempotencyKey: string;
	}) {
		return this.client.wallets().create({
			chain_type: 'ethereum',
			owner_id: input.ownerId,
			policy_ids: [input.ownerPolicyId],
			additional_signers: input.automationSigner
				? [
						{
							signer_id: input.automationSigner.signerId,
							override_policy_ids: [input.automationSigner.overridePolicyId]
						}
					]
				: undefined,
			idempotency_key: input.idempotencyKey,
			display_name: input.name
		});
	}

	async listWallets() {
		const output: unknown[] = [];
		for await (const wallet of this.client.wallets().list()) output.push(wallet);
		return output;
	}

	getWallet(walletId: string) {
		return this.client.wallets().get(walletId);
	}

	getWalletBalance(walletId: string) {
		return this.client.wallets().balance.get(walletId, {
			chain: 'base_sepolia',
			asset: ['eth', 'usdc']
		});
	}

	getPolicy(policyId: string) {
		return this.client.policies().get(policyId);
	}

	createPolicy(input: Record<string, unknown> & { idempotency_key: string }) {
		return this.client.policies().create(input as never);
	}

	transfer(input: {
		walletId: string;
		asset: 'ETH' | 'USDC';
		amount: string;
		destination: string;
		idempotencyKey: string;
		authorizationPrivateKey: string;
	}) {
		const body = {
			source: {
				asset: input.asset.toLowerCase(),
				amount: input.amount,
				chain: BASE_SEPOLIA.transferChain
			},
			destination: { address: input.destination }
		};
		const requestExpiry = Date.now() + 15 * 60 * 1000;
		const signature = generateAuthorizationSignature({
			authorizationPrivateKey: input.authorizationPrivateKey,
			input: {
				version: 1,
				method: 'POST',
				url: `https://api.privy.io/v1/wallets/${input.walletId}/transfer`,
				headers: {
					'privy-app-id': this.appId,
					'privy-idempotency-key': input.idempotencyKey,
					'privy-request-expiry': String(requestExpiry)
				},
				body
			}
		});
		return this.client.wallets()._transfer(input.walletId, {
			...body,
			'privy-authorization-signature': signature,
			'privy-idempotency-key': input.idempotencyKey,
			'privy-request-expiry': String(requestExpiry)
		} as never);
	}

	createTransferIntent(input: {
		walletId: string;
		asset: 'ETH' | 'USDC';
		amount: string;
		destination: string;
	}) {
		return this.client.intents().transfer(input.walletId, {
			source: {
				asset: input.asset.toLowerCase(),
				amount: input.amount,
				chain: BASE_SEPOLIA.transferChain
			},
			destination: { address: input.destination }
		} as never);
	}

	requestWalletUpdate(walletId: string, update: Record<string, unknown>) {
		return this.client.intents().updateWallet(walletId, update as never);
	}
	requestPolicyUpdate(policyId: string, update: Record<string, unknown>) {
		return this.client.intents().updatePolicy(policyId, update as never);
	}
	getIntent(intentId: string) {
		return this.client.intents().get(intentId);
	}
	async listIntents() {
		const output: unknown[] = [];
		for await (const intent of this.client.intents().list()) output.push(intent);
		return output;
	}
	getWalletAction(walletId: string, actionId: string) {
		return this.client.wallets().actions.get(actionId, { wallet_id: walletId } as never);
	}
}

export function createPrivyGateway(): PrivyGateway {
	const appId = process.env.PRIVY_APP_ID;
	const appSecret = process.env.PRIVY_APP_SECRET;
	if (!appId || !appSecret) throw new Error('Live Privy credentials are not configured.');
	return new LivePrivyGateway(appId, appSecret);
}
