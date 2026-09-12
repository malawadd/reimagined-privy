'use node';

import { PrivyClient } from '@privy-io/node';
import { BASE_SEPOLIA } from '../../lib/domain';

export interface PrivyGateway {
	provisionTreasury(input: {
		ownerId: string;
		name: string;
		idempotencyKey: string;
	}): Promise<unknown>;
	listWallets(): Promise<unknown[]>;
	getWallet(walletId: string): Promise<unknown>;
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

	constructor(appId: string, appSecret: string) {
		this.client = new PrivyClient({ appId, appSecret });
	}

	async provisionTreasury(input: { ownerId: string; name: string; idempotencyKey: string }) {
		return this.client.wallets().create({
			chain_type: 'ethereum',
			owner_id: input.ownerId,
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
		return this.client.wallets().transfer(input.walletId, {
			amount: input.amount,
			source: { asset: input.asset.toLowerCase(), chain: BASE_SEPOLIA.transferChain },
			destination: { address: input.destination },
			authorization_context: { authorization_private_keys: [input.authorizationPrivateKey] },
			idempotency_key: input.idempotencyKey
		} as never);
	}

	createTransferIntent(input: {
		walletId: string;
		asset: 'ETH' | 'USDC';
		amount: string;
		destination: string;
	}) {
		return this.client.intents().transfer(input.walletId, {
			amount: input.amount,
			source: { asset: input.asset.toLowerCase(), chain: BASE_SEPOLIA.transferChain },
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
	if (process.env.PRIVY_MODE === 'mock') return new MockPrivyGateway();
	const appId = process.env.PRIVY_APP_ID;
	const appSecret = process.env.PRIVY_APP_SECRET;
	if (!appId || !appSecret) throw new Error('Live Privy credentials are not configured.');
	return new LivePrivyGateway(appId, appSecret);
}

class MockPrivyGateway implements PrivyGateway {
	private result(kind: string, status = 'pending') {
		return { id: `${kind}_mock_${Date.now()}`, status, created_at: Date.now() };
	}
	provisionTreasury() {
		return Promise.resolve({
			...this.result('wallet', 'active'),
			address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
		});
	}
	listWallets() {
		return Promise.resolve([this.result('wallet', 'active')]);
	}
	getWallet(walletId: string) {
		return Promise.resolve({ ...this.result('wallet', 'active'), id: walletId });
	}
	createPolicy() {
		return Promise.resolve(this.result('policy', 'active'));
	}
	transfer() {
		return Promise.resolve(this.result('wallet_action'));
	}
	createTransferIntent() {
		return Promise.resolve({ ...this.result('intent'), type: 'TRANSFER' });
	}
	requestWalletUpdate() {
		return Promise.resolve({ ...this.result('intent'), type: 'WALLET_UPDATE' });
	}
	requestPolicyUpdate() {
		return Promise.resolve({ ...this.result('intent'), type: 'POLICY_UPDATE' });
	}
	getIntent(intentId: string) {
		return Promise.resolve({ ...this.result('intent'), id: intentId });
	}
	listIntents() {
		return Promise.resolve([]);
	}
	getWalletAction(_walletId: string, actionId: string) {
		return Promise.resolve({ ...this.result('wallet_action'), id: actionId });
	}
}
