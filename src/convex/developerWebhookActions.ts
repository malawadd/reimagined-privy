'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { createPrivateKey, createPublicKey, sign, type KeyObject } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { isPrivateIp, validateWebhookEndpointUrl } from '../lib/developer-api';

const DELIVERY_TIMEOUT_MS = 5_000;

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not configured.`);
	return value;
}

function webhookSigningKey(): KeyObject {
	const key = createPrivateKey(required('RATIB_WEBHOOK_PRIVATE_KEY_PEM').replace(/\\n/g, '\n'));
	const curve = key.asymmetricKeyDetails?.namedCurve;
	if (key.asymmetricKeyType !== 'ec' || (curve !== 'prime256v1' && curve !== 'P-256')) {
		throw new Error('webhook_signing_key_must_be_p256');
	}
	return key;
}

export async function resolvePublicWebhookAddress(hostname: string): Promise<{
	address: string;
	family: 4 | 6;
}> {
	const normalized = hostname.replace(/^\[|\]$/g, '');
	if (isIP(normalized)) {
		if (isPrivateIp(normalized)) throw new Error('webhook_host_not_public');
		return { address: normalized, family: isIP(normalized) as 4 | 6 };
	}
	let addresses: Array<{ address: string; family: 4 | 6 }>;
	try {
		addresses = (await lookup(normalized, { all: true, verbatim: true })).map((item) => ({
			address: item.address,
			family: item.family === 6 ? 6 : 4
		}));
	} catch {
		throw new Error('webhook_dns_failed');
	}
	if (!addresses.length) throw new Error('webhook_dns_failed');
	if (addresses.some((item) => isPrivateIp(item.address)))
		throw new Error('webhook_host_not_public');
	return addresses[0];
}

async function postPinnedWebhook(
	url: URL,
	body: string,
	headers: Record<string, string>
): Promise<number> {
	const hostname = url.hostname.replace(/^\[|\]$/g, '');
	const resolved = await resolvePublicWebhookAddress(hostname);
	return new Promise((resolve, reject) => {
		const request = httpsRequest(
			{
				protocol: 'https:',
				hostname: resolved.address,
				family: resolved.family,
				port: 443,
				servername: isIP(hostname) ? undefined : hostname,
				method: 'POST',
				path: `${url.pathname}${url.search}`,
				headers: {
					...headers,
					host: url.host,
					'content-length': String(Buffer.byteLength(body))
				}
			},
			(response) => {
				const status = response.statusCode ?? 0;
				response.destroy();
				resolve(status);
			}
		);
		request.setTimeout(DELIVERY_TIMEOUT_MS, () =>
			request.destroy(new Error('webhook_delivery_timeout'))
		);
		request.once('error', reject);
		request.end(body);
	});
}

export const deliver = internalAction({
	args: { deliveryId: v.id('developerWebhookDeliveries') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const bundle = await ctx.runMutation(internal.developerWebhookState.claim, args);
		if (!bundle) return null;
		let responseStatus: number | undefined;
		let errorCode: string | undefined;
		try {
			const url = new URL(validateWebhookEndpointUrl(bundle.endpoint.url));
			const body = JSON.stringify({
				id: String(bundle.event._id),
				type: bundle.event.eventType,
				schemaVersion: bundle.event.schemaVersion,
				occurredAt: new Date(bundle.event.occurredAt).toISOString(),
				aggregate: {
					type: bundle.event.aggregateType,
					id: bundle.event.aggregateId,
					sequence: bundle.event.aggregateSequence
				},
				data: bundle.event.data
			});
			const timestamp = String(Date.now());
			const keyId = required('RATIB_WEBHOOK_KEY_ID');
			const message = `${bundle.event._id}.${timestamp}.${body}`;
			const signature = sign('sha256', Buffer.from(message), webhookSigningKey()).toString(
				'base64url'
			);
			responseStatus = await postPinnedWebhook(url, body, {
				'content-type': 'application/json',
				'user-agent': 'Ratib-Webhooks/1.0',
				'x-ratib-event-id': String(bundle.event._id),
				'x-ratib-delivery-id': bundle.delivery.deliveryKey,
				'x-ratib-timestamp': timestamp,
				'x-ratib-signature': `kid=${keyId},v1=${signature}`
			});
			if (responseStatus < 200 || responseStatus >= 300) errorCode = 'endpoint_non_2xx';
		} catch (error) {
			errorCode =
				error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
					? error.message
					: 'delivery_network_error';
		}
		await ctx.runMutation(internal.developerWebhookState.complete, {
			deliveryId: args.deliveryId,
			leaseClaimedAt: bundle.leaseClaimedAt,
			succeeded: !errorCode,
			responseStatus,
			errorCode
		});
		return null;
	}
});

export const getJwks = internalAction({
	args: {},
	returns: v.any(),
	handler: async () => {
		const publicJwk = createPublicKey(webhookSigningKey()).export({ format: 'jwk' });
		return {
			keys: [{ ...publicJwk, use: 'sig', alg: 'ES256', kid: required('RATIB_WEBHOOK_KEY_ID') }]
		};
	}
});
