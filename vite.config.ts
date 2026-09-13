import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig(({ mode }) => {
	const environment = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
	if (environment.DEPLOY_ENV === 'production') {
		const required = [
			'PUBLIC_PRIVY_APP_ID',
			'PUBLIC_PRIVY_CLIENT_ID',
			'PUBLIC_CONVEX_URL',
			'PUBLIC_CONVEX_SITE_URL'
		];
		for (const key of required)
			if (!environment[key]) throw new Error(`Production requires ${key}.`);
		if (!environment.PUBLIC_CONVEX_URL?.startsWith('https://'))
			throw new Error('Production requires an HTTPS Convex deployment URL.');
		if (!environment.PUBLIC_CONVEX_SITE_URL?.startsWith('https://'))
			throw new Error('Production requires an HTTPS Convex site URL.');
	}

	return {
		plugins: [
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},

				// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
				// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
				// See https://svelte.dev/docs/kit/adapters for more information about adapters.
				adapter: adapter()
			})
		],
		test: {
			expect: { requireAssertions: true },
			projects: [
				{
					extends: './vite.config.ts',
					test: {
						name: 'server',
						environment: 'node',
						testTimeout: 15_000,
						include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
						exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
					}
				}
			]
		}
	};
});
