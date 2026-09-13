export const DEVELOPER_API_SCOPES = [
	'org:read',
	'wallets:read',
	'operations:read',
	'payments:create',
	'invoices:read',
	'batches:read',
	'payroll:read',
	'audit:read',
	'webhooks:manage'
] as const;

export type DeveloperApiScope = (typeof DEVELOPER_API_SCOPES)[number];
export type DeveloperCredentialAlgorithm = 'ES256';

export type DeveloperAccessTokenClaims = {
	iss: 'ratib';
	aud: 'ratib-developer-api';
	sub: string;
	credentialId: string;
	organizationId: string;
	scopes: DeveloperApiScope[];
	iat: number;
	exp: number;
	jti: string;
};

const scopeSet = new Set<string>(DEVELOPER_API_SCOPES);
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const noncePattern = /^[A-Za-z0-9_-]{16,120}$/;
const keyIdPattern = /^rcred_[A-Za-z0-9_-]{16,80}$/;

export function normalizeDeveloperScopes(values: readonly string[]): DeveloperApiScope[] {
	const unique = [...new Set(values.map((value) => value.trim()))].sort();
	if (unique.length === 0) throw new Error('Select at least one API scope.');
	for (const value of unique) {
		if (!scopeSet.has(value)) throw new Error(`Unsupported API scope: ${value}`);
	}
	return unique as DeveloperApiScope[];
}

export function requireDeveloperScope(
	granted: readonly string[],
	required: DeveloperApiScope
): void {
	if (!granted.includes(required)) throw new Error(`Missing API scope: ${required}`);
}

export function normalizeCredentialKeyId(value: string): string {
	const keyId = value.trim();
	if (!keyIdPattern.test(keyId)) throw new Error('Invalid credential key ID.');
	return keyId;
}

export function normalizeRequestNonce(value: string): string {
	const nonce = value.trim();
	if (!noncePattern.test(nonce)) throw new Error('Invalid request nonce.');
	return nonce;
}

export function canonicalizePublicJwk(value: unknown): string {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error('Public key must be a JWK object.');
	const jwk = value as Record<string, unknown>;
	if (jwk.kty !== 'EC' || jwk.crv !== 'P-256')
		throw new Error('Only P-256 public keys are supported.');
	if (typeof jwk.x !== 'string' || typeof jwk.y !== 'string')
		throw new Error('The public key is incomplete.');
	if (!base64UrlPattern.test(jwk.x) || !base64UrlPattern.test(jwk.y))
		throw new Error('The public key coordinates are invalid.');
	if (decodeBase64Url(jwk.x).byteLength !== 32 || decodeBase64Url(jwk.y).byteLength !== 32)
		throw new Error('The public key coordinates are invalid.');
	if ('d' in jwk) throw new Error('Private key material must never be uploaded.');
	return JSON.stringify({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y });
}

export function parsePublicJwk(value: string): JsonWebKey {
	return JSON.parse(canonicalizePublicJwk(JSON.parse(value))) as JsonWebKey;
}

export function buildCanonicalApiRequest(input: {
	method: string;
	target: string;
	contentDigest: string;
	timestamp: string;
	nonce: string;
	credentialId: string;
	idempotencyKey?: string;
}): string {
	const method = input.method.trim().toUpperCase();
	if (!/^[A-Z]+$/.test(method)) throw new Error('Invalid HTTP method.');
	if (!input.target.startsWith('/v1')) throw new Error('Invalid API target.');
	return [
		`method:${method}`,
		`target:${input.target}`,
		`content-digest:${input.contentDigest}`,
		`timestamp:${input.timestamp}`,
		`nonce:${normalizeRequestNonce(input.nonce)}`,
		`credential:${normalizeCredentialKeyId(input.credentialId)}`,
		`idempotency-key:${input.idempotencyKey?.trim() ?? ''}`
	].join('\n');
}

export async function sha256Base64Url(value: string | Uint8Array): Promise<string> {
	const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
	return encodeBase64Url(
		new Uint8Array(await crypto.subtle.digest('SHA-256', asArrayBuffer(bytes)))
	);
}

export async function verifyP256Signature(input: {
	publicJwk: string;
	message: string;
	signature: string;
}): Promise<boolean> {
	if (input.signature.length > 256 || !base64UrlPattern.test(input.signature)) return false;
	const key = await crypto.subtle.importKey(
		'jwk',
		parsePublicJwk(input.publicJwk),
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['verify']
	);
	return crypto.subtle.verify(
		{ name: 'ECDSA', hash: 'SHA-256' },
		key,
		asArrayBuffer(decodeBase64Url(input.signature)),
		new TextEncoder().encode(input.message)
	);
}

export async function signP256Request(privateJwk: JsonWebKey, message: string): Promise<string> {
	if (privateJwk.kty !== 'EC' || privateJwk.crv !== 'P-256' || !privateJwk.d)
		throw new Error('A P-256 private JWK is required.');
	const key = await crypto.subtle.importKey(
		'jwk',
		privateJwk,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' },
		key,
		new TextEncoder().encode(message)
	);
	return encodeBase64Url(new Uint8Array(signature));
}

export function validateRequestTimestamp(
	value: string,
	now = Date.now(),
	maxSkewMs = 300_000
): number {
	if (!/^\d{13}$/.test(value)) throw new Error('Invalid request timestamp.');
	const timestamp = Number(value);
	if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > maxSkewMs)
		throw new Error('Request timestamp is outside the allowed window.');
	return timestamp;
}

export function validateIdempotencyKey(value: string): string {
	const key = value.trim();
	if (!/^[A-Za-z0-9:_-]{12,100}$/.test(key)) throw new Error('Invalid idempotency key.');
	return key;
}

export function validateWebhookEndpointUrl(value: string): string {
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		throw new Error('Webhook endpoint must be a valid URL.');
	}
	if (url.protocol !== 'https:' || url.username || url.password || url.port)
		throw new Error('Webhook endpoints must use HTTPS on the default port.');
	if (url.hostname === 'localhost' || url.hostname.endsWith('.local') || isPrivateIp(url.hostname))
		throw new Error('Webhook endpoint host is not public.');
	url.hash = '';
	return url.toString();
}

export function isPrivateIp(value: string): boolean {
	const host = value.toLowerCase().replace(/^\[|\]$/g, '');
	const mappedIpv4 = parseMappedIpv4(host);
	if (mappedIpv4) return isReservedIpv4(mappedIpv4);
	if (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd'))
		return true;
	if (
		host.startsWith('fe8') ||
		host.startsWith('fe9') ||
		host.startsWith('fea') ||
		host.startsWith('feb')
	)
		return true;
	if (host.includes(':')) {
		return (
			!/^[23]/.test(host) ||
			host.startsWith('2001:db8:') ||
			host.startsWith('2001:10:') ||
			host.startsWith('2001:20:') ||
			host.startsWith('2001:2:') ||
			host.startsWith('2001::') ||
			host.startsWith('3fff:')
		);
	}
	const parts = parseIpv4(host);
	return parts ? isReservedIpv4(parts) : false;
}

function parseIpv4(value: string): number[] | null {
	if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return null;
	const parts = value.split('.').map(Number);
	return parts.every((part) => part >= 0 && part <= 255) ? parts : null;
}

function parseMappedIpv4(value: string): number[] | null {
	if (!value.startsWith('::ffff:')) return null;
	const suffix = value.slice('::ffff:'.length);
	const dotted = parseIpv4(suffix);
	if (dotted) return dotted;
	const words = suffix.split(':');
	if (words.length !== 2 || words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) return null;
	const high = Number.parseInt(words[0], 16);
	const low = Number.parseInt(words[1], 16);
	return [high >>> 8, high & 0xff, low >>> 8, low & 0xff];
}

function isReservedIpv4(parts: number[]): boolean {
	return (
		parts[0] === 10 ||
		parts[0] === 127 ||
		(parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
		(parts[0] === 169 && parts[1] === 254) ||
		(parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
		(parts[0] === 192 && parts[1] === 0 && parts[2] === 0) ||
		(parts[0] === 192 && parts[1] === 0 && parts[2] === 2) ||
		(parts[0] === 192 && parts[1] === 88 && parts[2] === 99) ||
		(parts[0] === 192 && parts[1] === 168) ||
		(parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) ||
		(parts[0] === 198 && parts[1] === 51 && parts[2] === 100) ||
		(parts[0] === 203 && parts[1] === 0 && parts[2] === 113) ||
		parts[0] === 0 ||
		parts[0] >= 224
	);
}

export function encodeBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function decodeBase64Url(value: string): Uint8Array {
	const base64 = value
		.replaceAll('-', '+')
		.replaceAll('_', '/')
		.padEnd(Math.ceil(value.length / 4) * 4, '=');
	const binary = atob(base64);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function apiError(code: string, message: string, requestId: string, status: number) {
	return { status, body: { type: 'https://ratib.dev/errors/' + code, code, message, requestId } };
}

export async function issueDeveloperAccessToken(
	claims: Omit<DeveloperAccessTokenClaims, 'iss' | 'aud' | 'iat' | 'exp' | 'jti'>,
	secret: string,
	now = Date.now()
): Promise<{ accessToken: string; expiresIn: number }> {
	assertTokenSecret(secret);
	const issuedAt = Math.floor(now / 1_000);
	const payload: DeveloperAccessTokenClaims = {
		...claims,
		iss: 'ratib',
		aud: 'ratib-developer-api',
		iat: issuedAt,
		exp: issuedAt + 600,
		jti: crypto.randomUUID()
	};
	const header = encodeBase64Url(
		new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
	);
	const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
	const message = `${header}.${encodedPayload}`;
	return { accessToken: `${message}.${await signToken(message, secret)}`, expiresIn: 600 };
}

export async function verifyDeveloperAccessToken(
	token: string,
	secret: string,
	now = Date.now()
): Promise<DeveloperAccessTokenClaims> {
	assertTokenSecret(secret);
	const parts = token.split('.');
	if (parts.length !== 3 || parts.some((part) => !base64UrlPattern.test(part)))
		throw new Error('invalid_access_token');
	const [header, payload, signature] = parts;
	const expected = await signToken(`${header}.${payload}`, secret);
	if (!constantTimeEqual(signature, expected)) throw new Error('invalid_access_token');
	let parsedHeader: unknown;
	let claims: unknown;
	try {
		parsedHeader = JSON.parse(new TextDecoder().decode(decodeBase64Url(header)));
		claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
	} catch {
		throw new Error('invalid_access_token');
	}
	if (
		!parsedHeader ||
		typeof parsedHeader !== 'object' ||
		(parsedHeader as Record<string, unknown>).alg !== 'HS256' ||
		!claims ||
		typeof claims !== 'object'
	)
		throw new Error('invalid_access_token');
	const value = claims as Record<string, unknown>;
	const scopes = Array.isArray(value.scopes)
		? normalizeDeveloperScopes(value.scopes as string[])
		: [];
	const nowSeconds = Math.floor(now / 1_000);
	if (
		value.iss !== 'ratib' ||
		value.aud !== 'ratib-developer-api' ||
		typeof value.sub !== 'string' ||
		typeof value.credentialId !== 'string' ||
		typeof value.organizationId !== 'string' ||
		typeof value.iat !== 'number' ||
		typeof value.exp !== 'number' ||
		typeof value.jti !== 'string' ||
		value.iat > nowSeconds + 30 ||
		value.exp <= nowSeconds ||
		value.exp - value.iat > 600
	)
		throw new Error('invalid_access_token');
	return { ...(value as unknown as DeveloperAccessTokenClaims), scopes };
}

async function signToken(message: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return encodeBase64Url(
		new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))
	);
}

function assertTokenSecret(secret: string): void {
	if (new TextEncoder().encode(secret).byteLength < 32)
		throw new Error('developer_token_configuration_missing');
}

function constantTimeEqual(left: string, right: string): boolean {
	if (left.length !== right.length) return false;
	let result = 0;
	for (let index = 0; index < left.length; index += 1)
		result |= left.charCodeAt(index) ^ right.charCodeAt(index);
	return result === 0;
}
