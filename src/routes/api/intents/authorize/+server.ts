import { env } from '$env/dynamic/public';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, fetch }) => {
	const authorization = request.headers.get('authorization');
	if (!authorization?.startsWith('Bearer '))
		return Response.json({ error: 'missing_bearer_token' }, { status: 401 });
	const siteUrl = env.PUBLIC_CONVEX_SITE_URL;
	if (!siteUrl)
		return Response.json({ error: 'authorization_service_unavailable' }, { status: 503 });
	const response = await fetch(`${siteUrl.replace(/\/$/, '')}/intents/authorize`, {
		method: 'POST',
		headers: { authorization, 'content-type': 'application/json' },
		body: await request.text()
	});
	return new Response(await response.text(), {
		status: response.status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});
};
