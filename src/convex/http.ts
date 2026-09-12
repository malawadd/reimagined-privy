import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

const http = httpRouter();

http.route({
	path: '/auth/exchange',
	method: 'POST',
	handler: httpAction(async (ctx, request) => {
		const authorization = request.headers.get('authorization');
		if (!authorization?.startsWith('Bearer ')) return json({ error: 'missing_bearer_token' }, 401);
		try {
			const token = await ctx.runAction(internal.auth.exchange, {
				accessToken: authorization.slice(7)
			});
			return json({ token, expiresIn: 300 });
		} catch {
			return json({ error: 'invalid_access_token' }, 401);
		}
	})
});

http.route({
	path: '/intents/authorize',
	method: 'POST',
	handler: httpAction(async (ctx, request) => {
		const authorization = request.headers.get('authorization');
		if (!authorization?.startsWith('Bearer ')) return json({ error: 'missing_bearer_token' }, 401);
		let body: {
			organizationId?: string;
			intentId?: string;
			signature?: string;
			timestamp?: number;
		};
		try {
			body = await request.json();
		} catch {
			return json({ error: 'invalid_json' }, 400);
		}
		if (
			!body.organizationId ||
			!body.intentId ||
			!body.signature ||
			!Number.isSafeInteger(body.timestamp) ||
			body.signature.length > 8_192
		)
			return json({ error: 'invalid_request' }, 400);
		try {
			const accessToken = authorization.slice(7);
			const verified = await ctx.runAction(internal.auth.verifySubject, {
				accessToken
			});
			const eligibility = await ctx.runQuery(internal.intentAuthorization.check, {
				subject: verified.subject,
				organizationId: body.organizationId as Id<'organizations'>,
				intentId: body.intentId
			});
			if (!eligibility.allowed || !eligibility.operationId)
				return json({ error: 'approval_not_allowed' }, 403);
			await ctx.runAction(internal.intentAuthorizationActions.authorize, {
				operationId: eligibility.operationId,
				intentId: body.intentId,
				signature: body.signature,
				timestamp: body.timestamp!,
				accessToken
			});
			return json({ ok: true });
		} catch {
			return json({ error: 'authorization_failed' }, 400);
		}
	})
});

http.route({
	path: '/webhooks/privy',
	method: 'POST',
	handler: httpAction(async (ctx, request) => {
		const rawBody = await request.text();
		const svixId = request.headers.get('svix-id');
		const svixTimestamp = request.headers.get('svix-timestamp');
		const svixSignature = request.headers.get('svix-signature');
		if (!svixId || !svixTimestamp || !svixSignature)
			return json({ error: 'missing_svix_headers' }, 400);
		try {
			const receipt = await ctx.runAction(internal.webhooks.verifyAndStore, {
				rawBody,
				svixId,
				svixTimestamp,
				svixSignature
			});
			return json({ ok: true, ...receipt }, 200);
		} catch {
			return json({ error: 'invalid_signature' }, 401);
		}
	})
});

function json(value: unknown, status = 200) {
	return new Response(JSON.stringify(value), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
}
export default http;
