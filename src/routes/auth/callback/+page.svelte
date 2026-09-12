<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { privyAuth } from '$lib/auth/privy.svelte';

	let message = $state('Completing Google sign-in…');

	onMount(async () => {
		await privyAuth.initialize();
		if (privyAuth.user) await goto('/app');
		else message = 'Sign-in could not be restored. Return to login and try again.';
	});
</script>

<main class="grid min-h-screen place-items-center bg-[#f6f7f9]">
	<div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">{message}</div>
</main>
