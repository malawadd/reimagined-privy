'use node';

import { generateAuthorizationSignature, PrivyClient } from '@privy-io/node';
import { BASE_SEPOLIA } from '../../lib/domain';

export interface PrivyGateway {
	createKeyQuorum(input: {
		userIds: string[];
		threshold: number;
		displayName: string;
	}): Promise<unknown>;
	getKeyQuorum(keyQuorumId: string): Promise<unknown>;
	provisionTreasury(input: {
		ownerId: string;
		name: string;
		ownerPolicyId: string;
		automationSigner?: { signerId: string; overridePolicyId: string };
		idempotencyKey: string;
		externalId?: string;
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
		idempotencyKey: string;
	}): Promise<unknown>;
	requestWalletUpdate(walletId: string, update: Record<string, unknown>): Promise<unknown>;
	requestPolicyUpdate(policyId: string, update: Record<string, unknown>): Promise<unknown>;
	getIntent(intentId: string): Promise<unknown>;
	authorizeIntent(
		intentId: string,
		signature: string,
		timestamp: number,
		accessToken: string
	): Promise<unknown>;
	requestKeyQuorumUpdate(keyQuorumId: string, update: Record<string, unknown>): Promise<unknown>;
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

	createKeyQuorum(input: { userIds: string[]; threshold: number; displayName: string }) {
		return this.client.keyQuorums().create({
			user_ids: input.userIds,
			authorization_threshold: input.threshold,
			display_name: input.displayName
		});
	}

	getKeyQuorum(keyQuorumId: string) {
		return this.client.keyQuorums().get(keyQuorumId);
	}

	async provisionTreasury(input: {
		ownerId: string;
		name: string;
		ownerPolicyId: string;
		automationSigner?: { signerId: string; overridePolicyId: string };
		idempotencyKey: string;
		externalId?: string;
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
			external_id: input.externalId,
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

	async getWalletBalance(walletId: string) {
		const [eth, usdc] = await Promise.all([
			this.client.wallets().balance.get(walletId, {
				chain: 'base_sepolia',
				asset: 'eth'
			}),
			this.client.wallets().balance.get(walletId, {
				chain: 'base_sepolia',
				asset: 'usdc'
			})
		]);
		return { balances: [...eth.balances, ...usdc.balances] };
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
		idempotencyKey: string;
	}) {
		return this.client.intents().transfer(
			input.walletId,
			{
				source: {
					asset: input.asset.toLowerCase(),
					amount: input.amount,
					chain: BASE_SEPOLIA.transferChain
				},
				destination: { address: input.destination }
			} as never,
			{ idempotencyKey: input.idempotencyKey, maxRetries: 0 }
		);
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
	authorizeIntent(intentId: string, signature: string, timestamp: number, accessToken: string) {
		return fetch(`https://api.privy.io/v1/intents/${encodeURIComponent(intentId)}/authorize`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${accessToken}`,
				'content-type': 'application/json',
				'privy-app-id': this.appId
			},
			body: JSON.stringify({ signature, timestamp })
		}).then(async (response) => {
			if (!response.ok) {
				const errorBody = await response.text();
				throw new Error(
					`Privy intent authorization failed (${response.status}): ${sanitizeProviderError(errorBody)}`
				);
			}
			return response.json();
		});
	}
	requestKeyQuorumUpdate(keyQuorumId: string, update: Record<string, unknown>) {
		return this.client.intents().updateKeyQuorum(keyQuorumId, update as never);
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

function sanitizeProviderError(value: string) {
	try {
		const parsed = JSON.parse(value) as { code?: unknown; error?: unknown; message?: unknown };
		const code = typeof parsed.code === 'string' ? parsed.code : 'provider_error';
		const message =
			typeof parsed.error === 'string'
				? parsed.error
				: typeof parsed.message === 'string'
					? parsed.message
					: 'request rejected';
		return `${code}: ${message}`.replace(/[\r\n]/g, ' ').slice(0, 300);
	} catch {
		return 'provider_error: request rejected';
	}
}

export function createPrivyGateway(): PrivyGateway {
	const appId = process.env.PRIVY_APP_ID;
	const appSecret = process.env.PRIVY_APP_SECRET;
	if (!appId || !appSecret) throw new Error('Live Privy credentials are not configured.');
	return new LivePrivyGateway(appId, appSecret);
}
