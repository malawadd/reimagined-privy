import { internal } from './_generated/api';
import type { DataModel, Doc, Id } from './_generated/dataModel';
import type { GenericActionCtx } from 'convex/server';
import {
	apiError,
	buildCanonicalApiRequest,
	issueDeveloperAccessToken,
	normalizeCredentialKeyId,
	normalizeRequestNonce,
	requireDeveloperScope,
	sha256Base64Url,
	validateIdempotencyKey,
	validateRequestTimestamp,
	verifyDeveloperAccessToken,
	verifyP256Signature,
	type DeveloperApiScope
} from '../lib/developer-api';

const maxBodyBytes = 64 * 1_024;
type DeveloperAuthBundle = {
	credential: Doc<'developerCredentials'>;
	account: Doc<'developerServiceAccounts'>;
	organization: Doc<'organizations'>;
	rateLimit: { limit: number; remaining: number; resetAt: number };
};

export async function handleDeveloperApiRequest(
	ctx: GenericActionCtx<DataModel>,
	request: Request
): Promise<Response> {
	const startedAt = Date.now();
	const requestId = `req_${crypto.randomUUID()}`;
	const url = new URL(request.url);
	if (url.pathname === '/v1/.well-known/webhook-jwks.json' && request.method === 'GET') {
		try {
			return json(
				await ctx.runAction(internal.developerWebhookActions.getJwks, {}),
				200,
				requestId
			);
		} catch {
			return problem(
				apiError('jwks_unavailable', 'Webhook verification keys are unavailable.', requestId, 503)
			);
		}
	}

	let auth: DeveloperAuthBundle | undefined;
	let responseStatus = 500;
	let errorCode: string | undefined;
	let idempotencyKeyHash: string | undefined;
	let correlationId: string | undefined;
	try {
		const contentLength = Number(request.headers.get('content-length') ?? '0');
		if (Number.isFinite(contentLength) && contentLength > maxBodyBytes)
			throw new Error('request_too_large');
		const body = ['GET', 'HEAD'].includes(request.method) ? '' : await request.text();
		if (new TextEncoder().encode(body).byteLength > maxBodyBytes)
			throw new Error('request_too_large');
		const nonce = normalizeRequestNonce(requiredHeader(request, 'x-ratib-nonce'));
		const contentDigest = await sha256Base64Url(body);
		const idempotencyKey = request.headers.get('idempotency-key')?.trim() || undefined;
		if (idempotencyKey) idempotencyKeyHash = await sha256Base64Url(idempotencyKey);
		const authorization = request.headers.get('authorization');
		let keyId: string;
		let signedAuthentication = false;
		if (authorization?.startsWith('Bearer ')) {
			if (url.pathname === '/v1/auth/token') throw new Error('signed_authentication_required');
			const claims = await verifyDeveloperAccessToken(
				authorization.slice('Bearer '.length),
				process.env.RATIB_DEVELOPER_TOKEN_SECRET ?? ''
			);
			keyId = normalizeCredentialKeyId(claims.credentialId);
			const credentialBundle = await ctx.runQuery(internal.developerApiData.lookupCredential, {
				keyId
			});
			if (
				!credentialBundle ||
				String(credentialBundle.account._id) !== claims.sub ||
				String(credentialBundle.account.organizationId) !== claims.organizationId
			)
				throw new Error('invalid_access_token');
			const timestamp = requiredHeader(request, 'x-ratib-timestamp');
			validateRequestTimestamp(timestamp);
			const signature = requiredHeader(request, 'x-ratib-signature');
			const claimedDigest = requiredHeader(request, 'x-ratib-content-sha256');
			if (claimedDigest !== contentDigest) throw new Error('content_digest_mismatch');
			const canonical = buildCanonicalApiRequest({
				method: request.method,
				target: `${url.pathname}${url.search}`,
				contentDigest,
				timestamp,
				nonce,
				credentialId: keyId,
				idempotencyKey
			});
			if (
				!(await verifyP256Signature({
					publicJwk: credentialBundle.credential.publicJwk,
					message: canonical,
					signature
				}))
			)
				throw new Error('invalid_signature');
			signedAuthentication = true;
		} else {
			keyId = normalizeCredentialKeyId(requiredHeader(request, 'x-ratib-key-id'));
			const timestamp = requiredHeader(request, 'x-ratib-timestamp');
			validateRequestTimestamp(timestamp);
			const signature = requiredHeader(request, 'x-ratib-signature');
			const claimedDigest = requiredHeader(request, 'x-ratib-content-sha256');
			if (claimedDigest !== contentDigest) throw new Error('content_digest_mismatch');
			const credentialBundle = await ctx.runQuery(internal.developerApiData.lookupCredential, {
				keyId
			});
			if (
				!credentialBundle ||
				credentialBundle.credential.status !== 'active' ||
				credentialBundle.account.status !== 'active'
			)
				throw new Error('invalid_credential');
			const canonical = buildCanonicalApiRequest({
				method: request.method,
				target: `${url.pathname}${url.search}`,
				contentDigest,
				timestamp,
				nonce,
				credentialId: keyId,
				idempotencyKey
			});
			if (
				!(await verifyP256Signature({
					publicJwk: credentialBundle.credential.publicJwk,
					message: canonical,
					signature
				}))
			)
				throw new Error('invalid_signature');
			signedAuthentication = true;
		}
		auth = await ctx.runMutation(internal.developerApiData.claimRequest, {
			keyId,
			nonceHash: await sha256Base64Url(nonce),
			bucket: request.method === 'GET' ? 'read' : 'write'
		});

		const dispatch = await dispatchRequest(ctx, request.method, url.pathname, body, auth, {
			requestId,
			idempotencyKey,
			requestFingerprint: await sha256Base64Url(
				`${request.method}\n${url.pathname}${url.search}\n${contentDigest}`
			),
			signedAuthentication
		});
		responseStatus = dispatch.status;
		correlationId = dispatch.correlationId;
		return json(dispatch.body, dispatch.status, requestId, {
			'ratelimit-limit': String(auth.rateLimit.limit),
			'ratelimit-remaining': String(auth.rateLimit.remaining),
			'ratelimit-reset': String(Math.ceil(auth.rateLimit.resetAt / 1_000)),
			...dispatch.headers
		});
	} catch (error) {
		errorCode = normalizeErrorCode(error);
		const mapped = mapError(errorCode, requestId);
		responseStatus = mapped.status;
		return problem(mapped);
	} finally {
		if (auth) {
			await ctx
				.runMutation(internal.developerApiData.recordRequest, {
					organizationId: auth.account.organizationId,
					serviceAccountId: auth.account._id,
					credentialId: auth.credential._id,
					requestId,
					method: request.method,
					route: routeTemplate(url.pathname),
					status: responseStatus,
					durationMs: Math.max(0, Date.now() - startedAt),
					errorCode,
					idempotencyKeyHash,
					correlationId
				})
				.catch(() => undefined);
		}
	}
}

async function dispatchRequest(
	ctx: GenericActionCtx<DataModel>,
	method: string,
	path: string,
	body: string,
	auth: DeveloperAuthBundle,
	request: {
		requestId: string;
		idempotencyKey?: string;
		requestFingerprint: string;
		signedAuthentication: boolean;
	}
) {
	const organizationId = auth.account.organizationId as Id<'organizations'>;
	const walletIds = auth.account.walletIds as Id<'wallets'>[];
	if (method === 'POST' && path === '/v1/auth/token') {
		if (!request.signedAuthentication) throw new Error('signed_authentication_required');
		const issued = await issueDeveloperAccessToken(
			{
				sub: String(auth.account._id),
				credentialId: auth.credential.keyId,
				organizationId: String(organizationId),
				scopes: auth.account.scopes
			},
			process.env.RATIB_DEVELOPER_TOKEN_SECRET ?? ''
		);
		return {
			status: 200,
			body: { access_token: issued.accessToken, token_type: 'Bearer', expires_in: issued.expiresIn }
		};
	}
	if (method === 'GET' && path === '/v1/organization') {
		requireScope(auth, 'org:read');
		return {
			status: 200,
			body: {
				data: await ctx.runQuery(internal.developerApiData.getOrganization, {
					organizationId
				})
			}
		};
	}
	if (method === 'GET' && path === '/v1/wallets') {
		requireScope(auth, 'wallets:read');
		return {
			status: 200,
			body: {
				data: await ctx.runQuery(internal.developerApiData.listWallets, {
					organizationId,
					walletIds
				})
			}
		};
	}
	if (method === 'GET' && path === '/v1/operations') {
		requireScope(auth, 'operations:read');
		return {
			status: 200,
			body: {
				data: await ctx.runQuery(internal.developerApiData.listOperations, {
					organizationId,
					walletIds
				})
			}
		};
	}
	const readRoutes: Record<
		string,
		{
			scope: DeveloperApiScope;
			query:
				| 'listInvoices'
				| 'listBatches'
				| 'listPayroll'
				| 'listPayouts'
				| 'getReport'
				| 'listAudit'
				| 'listWebhookEndpoints'
				| 'listWebhookDeliveries';
		}
	> = {
		'/v1/invoices': { scope: 'invoices:read', query: 'listInvoices' },
		'/v1/batches': { scope: 'batches:read', query: 'listBatches' },
		'/v1/payroll': { scope: 'payroll:read', query: 'listPayroll' },
		'/v1/payouts': { scope: 'batches:read', query: 'listPayouts' },
		'/v1/reports/finance': { scope: 'audit:read', query: 'getReport' },
		'/v1/audit-events': { scope: 'audit:read', query: 'listAudit' },
		'/v1/webhook-endpoints': { scope: 'webhooks:manage', query: 'listWebhookEndpoints' },
		'/v1/webhook-deliveries': { scope: 'webhooks:manage', query: 'listWebhookDeliveries' }
	};
	const readRoute = readRoutes[path];
	if (method === 'GET' && readRoute) {
		requireScope(auth, readRoute.scope);
		return {
			status: 200,
			body: {
				data: await ctx.runQuery(internal.developerApiData[readRoute.query], {
					organizationId,
					walletIds
				})
			}
		};
	}
	const operationMatch = path.match(/^\/v1\/operations\/([^/]+)$/);
	if (method === 'GET' && operationMatch) {
		requireScope(auth, 'operations:read');
		const operation = await ctx.runQuery(internal.developerApiData.getOperation, {
			organizationId,
			operationId: operationMatch[1] as Id<'operations'>,
			walletIds
		});
		if (!operation) throw new Error('resource_not_found');
		return { status: 200, body: { data: operation } };
	}
	if (method === 'POST' && path === '/v1/payments') {
		requireScope(auth, 'payments:create');
		if (!request.idempotencyKey) throw new Error('idempotency_key_required');
		const idempotencyKey = validateIdempotencyKey(request.idempotencyKey);
		let input: Record<string, unknown>;
		try {
			input = JSON.parse(body) as Record<string, unknown>;
		} catch {
			throw new Error('invalid_json');
		}
		if (
			typeof input.walletId !== 'string' ||
			!['ETH', 'USDC'].includes(String(input.asset)) ||
			typeof input.amount !== 'string' ||
			typeof input.destination !== 'string' ||
			typeof input.reference !== 'string' ||
			(input.memo !== undefined && typeof input.memo !== 'string')
		)
			throw new Error('invalid_request');
		const result = await ctx.runMutation(internal.developerApiData.createPayment, {
			organizationId,
			serviceAccountId: auth.account._id,
			credentialId: auth.credential._id,
			requestId: request.requestId,
			idempotencyKey,
			requestFingerprint: request.requestFingerprint,
			walletId: input.walletId as Id<'wallets'>,
			asset: input.asset as 'ETH' | 'USDC',
			amount: input.amount,
			destination: input.destination,
			reference: input.reference,
			memo: input.memo
		});
		return {
			status: result.deduplicated ? 200 : 202,
			body: { data: result.operation, deduplicated: result.deduplicated },
			correlationId: result.operation.correlationId,
			headers: { location: `/v1/operations/${result.operation.id}` }
		};
	}
	if (method === 'POST' && path === '/v1/webhook-endpoints') {
		requireScope(auth, 'webhooks:manage');
		if (!request.signedAuthentication) throw new Error('signed_authentication_required');
		if (!request.idempotencyKey) throw new Error('idempotency_key_required');
		const idempotencyKey = validateIdempotencyKey(request.idempotencyKey);
		const input = parseObjectBody(body);
		if (
			typeof input.url !== 'string' ||
			!Array.isArray(input.eventTypes) ||
			input.eventTypes.some((value) => typeof value !== 'string')
		)
			throw new Error('invalid_request');
		const result = await ctx.runMutation(internal.developerApiData.createWebhookEndpoint, {
			organizationId,
			serviceAccountId: auth.account._id,
			requestId: request.requestId,
			idempotencyKey,
			requestFingerprint: request.requestFingerprint,
			url: input.url,
			eventTypes: input.eventTypes as string[]
		});
		return {
			status: result.deduplicated ? 200 : 201,
			body: { data: result.endpoint, deduplicated: result.deduplicated },
			headers: { location: `/v1/webhook-endpoints/${result.endpoint.id}` }
		};
	}
	const replayMatch = path.match(/^\/v1\/webhook-deliveries\/([^/]+)\/replay$/);
	if (method === 'POST' && replayMatch) {
		requireScope(auth, 'webhooks:manage');
		if (!request.signedAuthentication) throw new Error('signed_authentication_required');
		if (!request.idempotencyKey) throw new Error('idempotency_key_required');
		const result = await ctx.runMutation(internal.developerApiData.replayWebhookDelivery, {
			organizationId,
			serviceAccountId: auth.account._id,
			requestId: request.requestId,
			idempotencyKey: validateIdempotencyKey(request.idempotencyKey),
			requestFingerprint: request.requestFingerprint,
			deliveryId: replayMatch[1]
		});
		return {
			status: result.deduplicated ? 200 : 202,
			body: { data: result.delivery, deduplicated: result.deduplicated },
			headers: { location: `/v1/webhook-deliveries/${result.delivery.id}` }
		};
	}
	throw new Error('route_not_found');
}

function parseObjectBody(body: string): Record<string, unknown> {
	let value: unknown;
	try {
		value = JSON.parse(body);
	} catch {
		throw new Error('invalid_json');
	}
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('invalid_request');
	return value as Record<string, unknown>;
}

function requireScope(auth: DeveloperAuthBundle, scope: DeveloperApiScope): void {
	try {
		requireDeveloperScope(auth.account.scopes, scope);
	} catch {
		throw new Error('missing_api_scope');
	}
}

function requiredHeader(request: Request, name: string): string {
	const value = request.headers.get(name);
	if (!value) throw new Error('missing_authentication_header');
	return value;
}

function normalizeErrorCode(error: unknown): string {
	const message = error instanceof Error ? error.message : '';
	const known = [
		'missing_authentication_header',
		'invalid_credential',
		'credential_inactive',
		'credential_expired',
		'invalid_access_token',
		'signed_authentication_required',
		'developer_token_configuration_missing',
		'organization_inactive',
		'invalid_signature',
		'request_replayed',
		'content_digest_mismatch',
		'request_too_large',
		'rate_limit_exceeded',
		'missing_api_scope',
		'wallet_not_allowed',
		'payment_not_allowed',
		'idempotency_key_required',
		'idempotency_key_reused',
		'idempotency_request_in_progress',
		'invalid_json',
		'invalid_request',
		'invalid_amount',
		'invalid_destination',
		'invalid_reference',
		'invalid_memo',
		'wallet_not_found',
		'resource_not_found',
		'invalid_webhook_events',
		'webhook_endpoint_exists',
		'webhook_endpoint_inactive',
		'webhook_management_not_allowed',
		'route_not_found'
	];
	return known.find((code) => message.includes(code)) ?? 'internal_error';
}

function mapError(code: string, requestId: string) {
	const errors: Record<string, { status: number; message: string }> = {
		missing_authentication_header: {
			status: 401,
			message: 'Required request authentication is missing.'
		},
		invalid_credential: { status: 401, message: 'The API credential is invalid or inactive.' },
		credential_inactive: { status: 401, message: 'The API credential is inactive.' },
		credential_expired: { status: 401, message: 'The API credential has expired.' },
		invalid_access_token: { status: 401, message: 'The API access token is invalid or expired.' },
		signed_authentication_required: {
			status: 401,
			message: 'This endpoint requires asymmetric request authentication.'
		},
		developer_token_configuration_missing: {
			status: 503,
			message: 'Short-lived API tokens are not configured.'
		},
		invalid_signature: { status: 401, message: 'The request signature is invalid.' },
		request_replayed: { status: 409, message: 'This signed request has already been used.' },
		content_digest_mismatch: {
			status: 400,
			message: 'The request body does not match its signed digest.'
		},
		request_too_large: { status: 413, message: 'The request body exceeds 64 KiB.' },
		rate_limit_exceeded: { status: 429, message: 'The API rate limit has been exceeded.' },
		missing_api_scope: {
			status: 403,
			message: 'The service account does not have the required scope.'
		},
		wallet_not_allowed: {
			status: 403,
			message: 'The service account is not assigned to this wallet.'
		},
		payment_not_allowed: { status: 403, message: 'The service account cannot create payments.' },
		idempotency_key_required: {
			status: 400,
			message: 'Idempotency-Key is required for this request.'
		},
		idempotency_key_reused: {
			status: 409,
			message: 'The idempotency key was used with a different request.'
		},
		idempotency_request_in_progress: {
			status: 409,
			message: 'The idempotent request is still being processed.'
		},
		invalid_json: { status: 400, message: 'The request body is not valid JSON.' },
		invalid_request: { status: 422, message: 'The request body is invalid.' },
		invalid_amount: { status: 422, message: 'The payment amount is invalid.' },
		invalid_destination: { status: 422, message: 'The payment destination is invalid.' },
		invalid_reference: { status: 422, message: 'The payment reference is invalid.' },
		invalid_memo: { status: 422, message: 'The payment memo is invalid.' },
		wallet_not_found: { status: 404, message: 'Wallet not found.' },
		resource_not_found: { status: 404, message: 'Resource not found.' },
		invalid_webhook_events: { status: 422, message: 'Webhook event filters are invalid.' },
		webhook_endpoint_exists: { status: 409, message: 'Webhook endpoint already exists.' },
		webhook_endpoint_inactive: { status: 409, message: 'Webhook endpoint is not active.' },
		webhook_management_not_allowed: {
			status: 403,
			message: 'The service account cannot manage webhooks.'
		},
		route_not_found: { status: 404, message: 'API route not found.' }
	};
	const found = errors[code] ?? { status: 500, message: 'The request could not be completed.' };
	return apiError(code in errors ? code : 'internal_error', found.message, requestId, found.status);
}

function routeTemplate(path: string): string {
	if (/^\/v1\/operations\/[^/]+$/.test(path)) return '/v1/operations/{operationId}';
	if (/^\/v1\/webhook-deliveries\/[^/]+\/replay$/.test(path))
		return '/v1/webhook-deliveries/{deliveryId}/replay';
	return path;
}

function json(
	value: unknown,
	status: number,
	requestId: string,
	extra: Record<string, string> = {}
) {
	return new Response(JSON.stringify(value), {
		status,
		headers: {
			'content-type': 'application/json',
			'cache-control': 'no-store',
			'x-request-id': requestId,
			...extra
		}
	});
}

function problem(value: { status: number; body: unknown }) {
	const requestId = (value.body as { requestId: string }).requestId;
	return new Response(JSON.stringify(value.body), {
		status: value.status,
		headers: {
			'content-type': 'application/problem+json',
			'cache-control': 'no-store',
			'x-request-id': requestId
		}
	});
}
