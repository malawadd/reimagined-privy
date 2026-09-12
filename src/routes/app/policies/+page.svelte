<script lang="ts">
	import { Check, Code2, History, Plus, ShieldCheck } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { compileTreasuryPolicy } from '$lib/policy';

	let limit = $state('100');
	let recipient = $state('0x1111111111111111111111111111111111111111');
	let requested = $state(false);
	const preview = $derived(
		compileTreasuryPolicy({
			approvedRecipients: [recipient],
			treasuryDestination: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
			automationLimitUsdc: limit
		})
	);
</script>

<PageHeader
	eyebrow="AUTHORIZATION"
	title="Policy builder"
	description="Compile safe templates, inspect provider JSON, and submit changes as native policy intents."
>
	{#snippet action()}<button class="button secondary"><History size={15} /> Version history</button
		>{/snippet}
</PageHeader>

<div class="policy-grid">
	<section class="panel policy-builder">
		<header>
			<div>
				<h2>Vendor payment boundary</h2>
				<p>Automation signer override · Base Sepolia USDC</p>
			</div>
			<StatusBadge status="active" />
		</header>
		<label for="limit">Per-transfer ceiling</label>
		<div class="input-suffix"><input id="limit" bind:value={limit} /><span>USDC</span></div>
		<div class="field-label">Approved recipients</div>
		<div class="recipient-row">
			<div class="recipient-avatar">AI</div>
			<div><strong>Acme Infrastructure</strong><small class="mono">{recipient}</small></div>
			<button aria-label="Remove">×</button>
		</div>
		<button class="add-row"><Plus size={15} /> Add approved recipient</button>
		<div class="rule-list">
			<h3>Effective restrictions</h3>
			<p><Check size={15} /> Chain is exactly Base Sepolia (84532)</p>
			<p><Check size={15} /> Asset is exactly Circle USDC</p>
			<p><Check size={15} /> ERC-20 transfer method only</p>
			<p><Check size={15} /> Unknown recipients are denied</p>
			<p><Check size={15} /> All unspecified behavior defaults to deny</p>
		</div>
		<button class="button primary wide" onclick={() => (requested = true)}
			>{requested ? 'Policy intent created' : 'Request policy update'}
			<ShieldCheck size={15} /></button
		>
		{#if requested}<p class="intent-notice">
				Intent policy_01JQ7C9 is awaiting 2-of-3 reviewer approval.
			</p>{/if}
	</section>
	<section class="panel code-preview">
		<header>
			<div>
				<h2>Generated Privy JSON</h2>
				<p>Preview generated from the selected template.</p>
			</div>
			<Code2 size={19} />
		</header>
		<pre>{JSON.stringify(preview, null, 2)}</pre>
		<div class="security-note">
			<ShieldCheck size={18} />
			<p>
				Wallet and policy administration always creates an intent. The backend adapter does not
				expose direct privileged updates.
			</p>
		</div>
	</section>
</div>
