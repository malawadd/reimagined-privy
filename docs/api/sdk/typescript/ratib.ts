export type RatibClientOptions = {
	baseUrl: string;
	keyId: string;
	privateJwk: JsonWebKey;
	fetch?: typeof globalThis.fetch;
};

export class RatibApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		readonly requestId: string,
		message: string
	) {
		super(message);
	}
}

export class RatibClient {
	private readonly baseUrl: string;
	private readonly fetcher: typeof globalThis.fetch;

	constructor(private readonly options: RatibClientOptions) {
		this.baseUrl = options.baseUrl.replace(/\/$/, '');
		this.fetcher = options.fetch ?? globalThis.fetch;
		if (!this.fetcher) throw new Error('A Fetch implementation is required.');
	}

	organization() {
		return this.request('/organization');
	}

	wallets() {
		return this.request('/wallets');
	}

	operations() {
		return this.request('/operations');
	}

	operation(operationId: string) {
		return this.request(`/operations/${encodeURIComponent(operationId)}`);
	}

	invoices() {
		return this.request('/invoices');
	}

	batches() {
		return this.request('/batches');
	}

	payroll() {
		return this.request('/payroll');
	}

	payouts() {
		return this.request('/payouts');
	}

	financeReport() {
		return this.request('/reports/finance');
	}

	auditEvents() {
		return this.request('/audit-events');
	}

	webhookEndpoints() {
		return this.request('/webhook-endpoints');
	}

	webhookDeliveries() {
		return this.request('/webhook-deliveries');
	}

	createPayment(
		payment: {
			walletId: string;
			asset: 'ETH' | 'USDC';
			amount: string;
			destination: string;
			reference: string;
			memo?: string;
		},
		idempotencyKey: string
	) {
		return this.request('/payments', { method: 'POST', body: payment, idempotencyKey });
	}

	createWebhookEndpoint(endpoint: { url: string; eventTypes: string[] }, idempotencyKey: string) {
		return this.request('/webhook-endpoints', {
			method: 'POST',
			body: endpoint,
			idempotencyKey
		});
	}

	replayWebhookDelivery(deliveryId: string, idempotencyKey: string) {
		return this.request(`/webhook-deliveries/${encodeURIComponent(deliveryId)}/replay`, {
			method: 'POST',
			body: {},
			idempotencyKey
		});
	}

	private async request(
		path: string,
		options: { method?: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string } = {}
	): Promise<unknown> {
		const method = options.method ?? 'GET';
		const body = options.body === undefined ? '' : JSON.stringify(options.body);
		const timestamp = String(Date.now());
		const nonce = base64Url(crypto.getRandomValues(new Uint8Array(18)));
		const digest = base64Url(
			new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)))
		);
		const target = `/v1${path}`;
		const canonical = [
			`method:${method}`,
			`target:${target}`,
			`content-digest:${digest}`,
			`timestamp:${timestamp}`,
			`nonce:${nonce}`,
			`credential:${this.options.keyId}`,
			`idempotency-key:${options.idempotencyKey ?? ''}`
		].join('\n');
		const key = await crypto.subtle.importKey(
			'jwk',
			this.options.privateJwk,
			{ name: 'ECDSA', namedCurve: 'P-256' },
			false,
			['sign']
		);
		const signature = base64Url(
			new Uint8Array(
				await crypto.subtle.sign(
					{ name: 'ECDSA', hash: 'SHA-256' },
					key,
					new TextEncoder().encode(canonical)
				)
			)
		);
		const response = await this.fetcher(`${this.baseUrl}${target}`, {
			method,
			body: body || undefined,
			headers: {
				...(body ? { 'content-type': 'application/json' } : {}),
				'x-ratib-key-id': this.options.keyId,
				'x-ratib-timestamp': timestamp,
				'x-ratib-nonce': nonce,
				'x-ratib-content-sha256': digest,
				'x-ratib-signature': signature,
				...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {})
			}
		});
		const payload = (await response.json()) as Record<string, unknown>;
		if (!response.ok) {
			throw new RatibApiError(
				response.status,
				String(payload.code ?? 'request_failed'),
				String(payload.requestId ?? response.headers.get('x-request-id') ?? ''),
				String(payload.message ?? 'Ratib API request failed.')
			);
		}
		return payload.data ?? payload;
	}
}

function base64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
