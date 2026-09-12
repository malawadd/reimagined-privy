<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { privyAuth } from '$lib/auth/privy.svelte';
	import { ArrowLeft, ArrowRight, Check, LockKeyhole, ShieldCheck, Workflow } from '@lucide/svelte';

	let email = $state('');
	let code = $state('');

	onMount(async () => {
		await privyAuth.initialize();
		if (privyAuth.user) await goto('/app');
	});

	async function submitEmail() {
		try {
			if (!privyAuth.codeSent) await privyAuth.sendEmailCode(email);
			else {
				await privyAuth.loginWithEmail(email, code);
				await goto('/app');
			}
		} catch {
			// The auth store exposes a user-safe error message.
		}
	}

	async function google() {
		try {
			await privyAuth.loginWithGoogle();
		} catch (error) {
			privyAuth.error = error instanceof Error ? error.message : 'Unable to start Google sign-in.';
		}
	}
</script>

<svelte:head>
	<title>Sign in | Ratib</title>
	<meta name="description" content="Sign in to your Ratib finance operations workspace." />
</svelte:head>

<main class="ratib-login">
	<section class="login-context">
		<a class="back" href="/"><ArrowLeft size={16} /> Back to Ratib</a>
		<div class="context-copy">
			<p class="eyebrow light">CONTROLLED FINANCE OPERATIONS</p>
			<h1>Your money movement, governed from one workspace.</h1>
			<p>
				Ratib connects business wallets, payments, approvals, automation, and audit evidence without
				replacing Privy as the signing authority.
			</p>
			<div class="feature-list">
				<div>
					<span><ShieldCheck size={19} /></span>
					<div>
						<strong>Quorum approvals</strong><small
							>Reviewers authorize sensitive intents in Privy with MFA.</small
						>
					</div>
				</div>
				<div>
					<span><Workflow size={19} /></span>
					<div>
						<strong>Policy-bound execution</strong><small
							>Automation stays inside explicit wallet and transfer policies.</small
						>
					</div>
				</div>
				<div>
					<span><LockKeyhole size={19} /></span>
					<div>
						<strong>Linked evidence</strong><small
							>Operations, provider references, and transaction hashes stay traceable.</small
						>
					</div>
				</div>
			</div>
		</div>
		<footer><span><i></i> Base Sepolia controlled pilot</span><span>Privy + Convex</span></footer>
	</section>

	<section class="login-panel" aria-labelledby="sign-in-title">
		<div class="login-card">
			<a class="mobile-brand" href="/"><span>R</span>RATIB</a>
			<p class="eyebrow">SECURE WORKSPACE</p>
			<h2 id="sign-in-title">Welcome back</h2>
			<p class="muted">Use your approved business identity to continue.</p>
			<button
				class="google"
				type="button"
				onclick={google}
				disabled={!privyAuth.ready || privyAuth.loading}><b>G</b> Continue with Google</button
			>
			<div class="divider"><span>or continue with email</span></div>
			<form
				onsubmit={(event) => {
					event.preventDefault();
					void submitEmail();
				}}
			>
				<label for="email">Work email</label>
				<input id="email" type="email" autocomplete="email" bind:value={email} required />
				{#if privyAuth.codeSent}
					<label for="code">One-time code</label>
					<input
						id="code"
						inputmode="numeric"
						autocomplete="one-time-code"
						maxlength="6"
						bind:value={code}
						required
					/>
				{/if}
				<button class="primary" type="submit" disabled={!privyAuth.ready || privyAuth.loading}>
					{privyAuth.loading
						? 'Connecting…'
						: privyAuth.codeSent
							? 'Enter workspace'
							: 'Send secure code'}
					<ArrowRight size={17} />
				</button>
			</form>
			{#if privyAuth.error}<p class="form-error" role="alert">{privyAuth.error}</p>{/if}
			<div class="assurance">
				<Check size={15} /><span>Short-lived sessions · No passwords · MFA-ready</span>
			</div>
			<p class="terms">Access is limited to organizations approved for the controlled pilot.</p>
		</div>
	</section>
</main>

<style>
	.ratib-login {
		display: grid;
		min-height: 100vh;
		grid-template-columns: minmax(440px, 1.05fr) minmax(420px, 0.95fr);
		background: #f8fafb;
	}
	.login-context {
		display: flex;
		min-height: 100vh;
		flex-direction: column;
		padding: 38px 50px;
		color: #f5f9fa;
		background: #0c2e3f;
	}
	.back {
		display: inline-flex;
		width: fit-content;
		align-items: center;
		gap: 8px;
		color: #b7c8cf;
		font-size: 0.78rem;
		font-weight: 700;
	}
	.context-copy {
		margin: auto 0;
		max-width: 650px;
	}
	.context-copy h1 {
		max-width: 620px;
		margin: 20px 0;
		font-family: Georgia, serif;
		font-size: clamp(2.8rem, 5vw, 5.1rem);
		font-weight: 400;
		line-height: 1.02;
		letter-spacing: 0;
	}
	.context-copy > p:last-of-type {
		max-width: 570px;
		color: #b7c8cf;
		font-size: 1rem;
		line-height: 1.7;
	}
	.feature-list {
		margin-top: 38px;
	}
	.feature-list > div > span {
		border-radius: 7px;
	}
	.login-context footer {
		display: flex;
		justify-content: space-between;
		color: #90a7b1;
		font-size: 0.7rem;
	}
	.login-context footer span:first-child {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.login-context footer i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #58c59d;
	}
	.login-panel {
		min-height: 100vh;
	}
	.mobile-brand {
		text-decoration: none;
	}
	.login-card label {
		margin-top: 14px;
	}
	@media (max-width: 820px) {
		.ratib-login {
			display: block;
		}
		.login-context {
			display: none;
		}
		.login-panel {
			padding: 28px;
		}
		.mobile-brand {
			display: flex;
			margin-bottom: 48px;
		}
	}
</style>
