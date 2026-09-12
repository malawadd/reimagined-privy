<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { env } from '$env/dynamic/public';
	import { setupAuth, setupConvex } from 'convex-svelte';
	import { privyAuth } from '$lib/auth/privy.svelte';

	let { children } = $props();

	if (env.PUBLIC_CONVEX_URL) {
		setupConvex(env.PUBLIC_CONVEX_URL);
		setupAuth(() => ({
			isLoading: privyAuth.loading || !privyAuth.ready,
			isAuthenticated: Boolean(privyAuth.user),
			fetchAccessToken: async () => {
				const accessToken = await privyAuth.getAccessToken();
				if (!accessToken || !env.PUBLIC_CONVEX_SITE_URL) return null;
				const response = await fetch(`${env.PUBLIC_CONVEX_SITE_URL}/auth/exchange`, {
					method: 'POST',
					headers: { authorization: `Bearer ${accessToken}` }
				});
				if (!response.ok) return null;
				return ((await response.json()) as { token: string }).token;
			}
		}));
	}
</script>

<svelte:head
	><link rel="icon" href={favicon} /><meta name="theme-color" content="#0c3148" /></svelte:head
>
{@render children()}
