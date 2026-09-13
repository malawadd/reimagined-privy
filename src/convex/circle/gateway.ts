'use node';

import { normalizeDecimal, normalizeEvmAddress } from '../../lib/domain';

const CIRCLE_SANDBOX_ORIGIN = 'https://api-sandbox.circle.com';
const MAX_RESPONSE_BYTES = 256_000;

export type CircleRecipientStatus = 'pending' | 'active' | 'inactive' | 'denied';
export type CirclePayoutStatus = 'pending' | 'review' | 'complete' | 'failed' | 'returned';

export type CircleRecipient = {
	id: string;
	address: string;
	chain: string;
	status: CircleRecipientStatus;
};

export type CirclePayout = {
	id: string;
	status: CirclePayoutStatus;
	amount: string;
	currency: string;
	feeAmount?: string;
	transactionHash?: string;
	failureCode?: string;
};

export class CircleSandboxGateway {
	constructor(
		private readonly apiKey: string,
		private readonly fetcher: typeof fetch = fetch
	) {
		if (!apiKey.trim()) throw new Error('circle_sandbox_not_configured');
	}

	async createRecipient(input: {
		idempotencyKey: string;
		address: string;
		nickname: string;
		businessName: string;
	}) {
		const address = normalizeEvmAddress(input.address);
		const data = await this.request('/v1/addressBook/recipients', {
			method: 'POST',
			body: {
				idempotencyKey: uuid(input.idempotencyKey),
				chain: 'BASE',
				address,
				metadata: { nickname: input.nickname.trim().slice(0, 100) },
				identity: { type: 'business', businessName: input.businessName.trim().slice(0, 120) }
			}
		});
		return recipient(data);
	}

	async getRecipient(id: string) {
		return recipient(await this.request(`/v1/addressBook/recipients/${providerId(id)}`));
	}

	async createPayout(input: {
		idempotencyKey: string;
		recipientId: string;
		amount: string;
		purposeOfTransfer: string;
	}) {
		const amount = normalizeDecimal(input.amount, 6);
		if (amount === '0') throw new Error('circle_payout_amount_invalid');
		const data = await this.request('/v1/payouts', {
			method: 'POST',
			body: {
				idempotencyKey: uuid(input.idempotencyKey),
				destination: { type: 'address_book', id: providerId(input.recipientId) },
				amount: { amount, currency: 'USD' },
				purposeOfTransfer: input.purposeOfTransfer.trim().slice(0, 32)
			}
		});
		return payout(data);
	}

	async getPayout(id: string) {
		return payout(await this.request(`/v1/payouts/${providerId(id)}`));
	}

	private async request(path: string, options?: { method: 'POST'; body: unknown }) {
		const response = await this.fetcher(`${CIRCLE_SANDBOX_ORIGIN}${path}`, {
			method: options?.method ?? 'GET',
			signal: AbortSignal.timeout(15_000),
			headers: {
				accept: 'application/json',
				authorization: `Bearer ${this.apiKey}`,
				...(options ? { 'content-type': 'application/json' } : {})
			},
			body: options ? JSON.stringify(options.body) : undefined
		});
		const declared = Number(response.headers.get('content-length') ?? '0');
		if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES)
			throw new Error('circle_response_too_large');
		const text = await response.text();
		if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES)
			throw new Error('circle_response_too_large');
		if (!response.ok) {
			if (response.status === 401) throw new Error('circle_credentials_invalid');
			if (response.status === 429) throw new Error('circle_rate_limited');
			if (response.status >= 500) throw new Error('circle_provider_unavailable');
			throw new Error('circle_request_rejected');
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			throw new Error('circle_response_invalid');
		}
		if (!parsed || typeof parsed !== 'object' || !('data' in parsed))
			throw new Error('circle_response_invalid');
		return (parsed as { data: unknown }).data;
	}
}

function providerId(value: string) {
	const id = value.trim();
	if (!/^[A-Za-z0-9_-]{8,100}$/.test(id)) throw new Error('circle_provider_id_invalid');
	return encodeURIComponent(id);
}

function uuid(value: string) {
	const id = value.trim();
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
		throw new Error('circle_idempotency_key_invalid');
	return id;
}

function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('circle_response_invalid');
	return value as Record<string, unknown>;
}

function requiredString(value: unknown) {
	if (typeof value !== 'string' || !value.trim() || value.length > 300)
		throw new Error('circle_response_invalid');
	return value;
}

function recipient(value: unknown): CircleRecipient {
	const data = record(value);
	const status = requiredString(data.status).toLowerCase();
	if (!['pending', 'active', 'inactive', 'denied'].includes(status))
		throw new Error('circle_response_invalid');
	return {
		id: requiredString(data.id),
		address: requiredString(data.address),
		chain: requiredString(data.chain),
		status: status as CircleRecipientStatus
	};
}

function payout(value: unknown): CirclePayout {
	const data = record(value);
	const amount = record(data.amount);
	const fees = data.fees ? record(data.fees) : undefined;
	const status = requiredString(data.status).toLowerCase();
	if (!['pending', 'review', 'complete', 'failed', 'returned'].includes(status))
		throw new Error('circle_response_invalid');
	return {
		id: requiredString(data.id),
		status: status as CirclePayoutStatus,
		amount: normalizeDecimal(requiredString(amount.amount), 6),
		currency: requiredString(amount.currency),
		feeAmount: fees?.amount ? normalizeDecimal(requiredString(fees.amount), 6) : undefined,
		transactionHash:
			typeof data.transactionHash === 'string' ? data.transactionHash.slice(0, 300) : undefined,
		failureCode: typeof data.errorCode === 'string' ? data.errorCode.slice(0, 80) : undefined
	};
}
