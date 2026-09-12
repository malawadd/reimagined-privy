import { env } from '$env/dynamic/public';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, fetch }) => {
	const authorization = request.headers.get('authorization');
	if (!authorization?.startsWith('Bearer ')) {
		return json({ error: 'missing_bearer_token' }, { status: 401 });
	}
	if (!env.PUBLIC_CONVEX_SITE_URL) {
		return json({ error: 'convex_site_unavailable' }, { status: 503 });
	}

	const response = await fetch(`${env.PUBLIC_CONVEX_SITE_URL}/auth/exchange`, {
		method: 'POST',
		headers: {
			authorization,
			'content-type': 'application/json'
		}
	});
	return new Response(response.body, {
		status: response.status,
		headers: {
			'content-type': response.headers.get('content-type') ?? 'application/json',
			'cache-control': 'no-store'
		}
	});
};
