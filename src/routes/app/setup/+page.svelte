<script lang="ts">
	import { Check, Circle, ExternalLink, ShieldCheck } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { setupSteps } from '$lib/mock-data';
</script>

<PageHeader
	eyebrow="GUIDED ONBOARDING"
	title="Launch checklist"
	description="Connect the provider, establish controls, and prove the testnet flow before deployment."
/>
<div class="setup-grid">
	<section class="panel setup-list">
		<header>
			<div>
				<h2>Environment readiness</h2>
				<p>Development project · Base Sepolia</p>
			</div>
			<strong>5 / 6</strong>
		</header>
		{#each setupSteps as step, index}<article class:incomplete={!step.done}>
				<span
					>{#if step.done}<Check size={17} />{:else}<Circle size={17} />{/if}</span
				>
				<div>
					<small>STEP {index + 1}</small>
					<h3>{step.name}</h3>
					<p>{step.detail}</p>
				</div>
				<button>{step.done ? 'Review' : 'Configure'} <ExternalLink size={13} /></button>
			</article>{/each}
	</section>
	<aside class="side-stack">
		<section class="panel production-gate">
			<ShieldCheck size={24} />
			<p class="eyebrow">PRODUCTION GATE</p>
			<h2>Fail closed by design</h2>
			<p>
				A production build refuses to start when mock mode is enabled, public IDs are missing, or
				the Convex endpoint is not secure.
			</p>
			<code>PUBLIC_PRIVY_MODE=live</code><code>NODE_ENV=production</code>
		</section>
		<section class="panel">
			<h2>Environment separation</h2>
			<p class="muted">
				Use independent Privy and Convex projects, authorization keys, webhook keys, and treasury
				funding for development and production.
			</p>
			<a class="text-link" href="/docs/deployment">Read deployment guide</a>
		</section>
	</aside>
</div>
