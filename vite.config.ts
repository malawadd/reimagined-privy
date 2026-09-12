import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';

if (process.env.DEPLOY_ENV === 'production') {
	const required = [
		'PUBLIC_PRIVY_APP_ID',
		'PUBLIC_PRIVY_CLIENT_ID',
		'PUBLIC_CONVEX_URL',
		'PUBLIC_CONVEX_SITE_URL'
	];
	if (process.env.PUBLIC_PRIVY_MODE !== 'live')
		throw new Error('Production requires PUBLIC_PRIVY_MODE=live.');
	for (const key of required) if (!process.env[key]) throw new Error(`Production requires ${key}.`);
	if (!process.env.PUBLIC_CONVEX_SITE_URL?.startsWith('https://'))
		throw new Error('Production requires an HTTPS Convex site URL.');
}

export default defineConfig({
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
					include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
