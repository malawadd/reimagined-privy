<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { privyAuth } from '$lib/auth/privy.svelte';
	import { ArrowRight, Check, LockKeyhole, ShieldCheck, Workflow } from '@lucide/svelte';

	let email = $state('operator@northstar.test');
	let code = $state('123456');

	onMount(() => privyAuth.initialize());

	async function submitEmail() {
		if (!privyAuth.codeSent) await privyAuth.sendEmailCode(email);
		else {
			await privyAuth.loginWithEmail(email, code);
			await goto('/app');
		}
	}

	async function google() {
		await privyAuth.loginWithGoogle();
		if (privyAuth.isMock) await goto('/app');
	}
</script>

<svelte:head>
	<title>Northstar — Controlled treasury operations</title>
	<meta
		name="description"
		content="A SvelteKit, Convex and Privy starter for controlled B2B wallet operations."
	/>
</svelte:head>

<main class="login-page">
	<section class="login-story">
		<div class="wordmark"><span>N</span>NORTHSTAR <small>OPERATIONS</small></div>
		<div class="story-copy">
			<div class="eyebrow light">PRIVY B2B STARTER</div>
			<h1>Move money with<br /><em>control built in.</em></h1>
			<p>
				A production-minded reference for treasury wallets, policy-bound automation, and
				quorum-approved payments.
			</p>
			<div class="feature-list">
				<div>
					<span><ShieldCheck size={19} /></span>
					<div>
						<strong>2-of-3 reviewer approvals</strong><small
							>Native Privy intents, reviewed with MFA</small
						>
					</div>
				</div>
				<div>
					<span><Workflow size={19} /></span>
					<div>
						<strong>Policy-bounded automation</strong><small
							>Deterministic runs with default-deny controls</small
						>
					</div>
				</div>
				<div>
					<span><LockKeyhole size={19} /></span>
					<div>
						<strong>Immutable audit evidence</strong><small
							>Every actor, intent, action, and transaction linked</small
						>
					</div>
				</div>
			</div>
		</div>
		<div class="story-foot">
			<span><i></i> Base Sepolia showcase</span><span>Powered by Privy + Convex</span>
		</div>
	</section>
	<section class="login-panel">
		<div class="login-card">
			<div class="mobile-brand"><span>N</span>NORTHSTAR</div>
			<p class="eyebrow">SECURE WORKSPACE</p>
			<h2>Welcome back</h2>
			<p class="muted">Sign in to manage Northstar's treasury operations.</p>
			<button class="google" onclick={google}><b>G</b> Continue with Google</button>
			<div class="divider"><span>or continue with email</span></div>
			<form
				onsubmit={(event) => {
					event.preventDefault();
					submitEmail();
				}}
			>
				<label for="email">Work email</label>
				<input id="email" type="email" bind:value={email} required />
				{#if privyAuth.codeSent}
					<div class="code-row">
						<label for="code">One-time code</label><small>Mock code: 123456</small>
					</div>
					<input id="code" inputmode="numeric" maxlength="6" bind:value={code} required />
				{/if}
				<button class="primary" type="submit" disabled={privyAuth.loading}
					>{privyAuth.codeSent ? 'Enter workspace' : 'Send secure code'}
					<ArrowRight size={17} /></button
				>
			</form>
			{#if privyAuth.error}<p class="form-error">{privyAuth.error}</p>{/if}
			<div class="assurance">
				<Check size={15} /><span>SSO-ready · Short-lived sessions · No passwords</span>
			</div>
			<p class="terms">
				By continuing, you agree to the demonstration terms. No mainnet funds are used.
			</p>
		</div>
	</section>
</main>
