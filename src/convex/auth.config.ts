const emptyJwks = encodeURIComponent(JSON.stringify({ keys: [] }));

export default {
	providers: [
		{
			type: 'customJwt' as const,
			issuer: process.env.AUTH_ISSUER ?? 'https://replace-before-deploy.invalid',
			applicationID: 'convex',
			algorithm: 'RS256' as const,
			jwks: process.env.CONVEX_AUTH_JWKS ?? `data:application/json,${emptyJwks}`
		}
	]
};
