<script lang="ts">
	import { ArrowRight, Check, ShieldCheck, Zap } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { selectPaymentRoute, type Asset } from '$lib/domain';

	let recipient = $state('0x1111111111111111111111111111111111111111');
	let amount = $state('84.00');
	let asset = $state<Asset>('USDC');
	let memo = $state('September cloud hosting');
	let approved = $state(true);
	let submitted = $state(false);
	const route = $derived(
		selectPaymentRoute({
			asset,
			amount: amount || '0',
			destination: recipient,
			recipientApproved: approved
		})
	);
</script>

<PageHeader
	eyebrow="NEW OPERATION"
	title="Create payment"
	description="Preview the control path before anything is submitted to Privy."
/>

{#if submitted}
	<section class="success-state panel">
		<span><Check size={28} /></span>
		<p class="eyebrow">OPERATION CREATED</p>
		<h2>
			{route.path === 'automationSigner' ? 'Payment is executing' : 'Approval intent is pending'}
		</h2>
		<p>
			{amount}
			{asset} to Acme Infrastructure was routed through
			<strong
				>{route.path === 'automationSigner'
					? 'the policy-bound automation signer'
					: 'the Privy reviewer quorum'}</strong
			>.
		</p>
		<div class="receipt-grid">
			<div><span>Operation ID</span><strong>op_01JQ7C4MX82</strong></div>
			<div><span>Control path</span><strong>{route.path}</strong></div>
			<div>
				<span>Provider reference</span><strong
					>{route.path === 'privyIntent' ? 'intent_01JQ7C5A2C' : 'wa_01JQ7C5A2C'}</strong
				>
			</div>
		</div>
		<a class="button secondary" href="/app/approvals">View lifecycle <ArrowRight size={16} /></a>
	</section>
{:else}
	<div class="payment-grid">
		<form
			class="panel payment-form"
			onsubmit={(event) => {
				event.preventDefault();
				submitted = true;
			}}
		>
			<header>
				<div>
					<h2>Payment details</h2>
					<p>Base Sepolia is the only enabled network in v1.</p>
				</div>
				<span class="step">1 / 2</span>
			</header>
			<label for="recipient">Recipient</label><select id="recipient" bind:value={recipient}
				><option value="0x1111111111111111111111111111111111111111"
					>Acme Infrastructure · approved</option
				><option value="0x2222222222222222222222222222222222222222"
					>New recipient · unapproved</option
				></select
			>
			<label for="wallet">Wallet</label><select id="wallet"
				><option>Operating Treasury · 0x71C7…976F</option></select
			>
			<div class="field-pair">
				<div>
					<label for="amount">Amount</label><input
						id="amount"
						bind:value={amount}
						inputmode="decimal"
						required
					/>
				</div>
				<div>
					<label for="asset">Asset</label><select id="asset" bind:value={asset}
						><option>USDC</option><option>ETH</option></select
					>
				</div>
			</div>
			<label for="memo">Memo</label><input id="memo" bind:value={memo} />
			<label class="toggle-row"
				><input type="checkbox" bind:checked={approved} /><span
					>Recipient is in the organization allowlist</span
				></label
			>
			<button class="button primary wide" type="submit"
				>Confirm and create <ArrowRight size={16} /></button
			>
		</form>
		<aside class="panel route-preview">
			<p class="eyebrow">CONTROL ROUTE PREVIEW</p>
			<div
				class:route-auto={route.path === 'automationSigner'}
				class:route-intent={route.path === 'privyIntent'}
				class="route-icon"
			>
				{#if route.path === 'automationSigner'}<Zap size={24} />{:else}<ShieldCheck
						size={24}
					/>{/if}
			</div>
			<h2>
				{route.path === 'automationSigner'
					? 'Automatic execution'
					: route.path === 'privyIntent'
						? 'Quorum approval'
						: 'Policy change required'}
			</h2>
			<p>{route.reason}</p>
			<div class="route-path">
				<div class="active">
					<span>1</span>
					<p><strong>Validate locally</strong><small>Explanatory preview only</small></p>
				</div>
				<i></i>
				<div class="active">
					<span>2</span>
					<p>
						<strong
							>{route.path === 'automationSigner' ? 'Transfer action' : 'TRANSFER intent'}</strong
						><small>Submitted to Privy</small>
					</p>
				</div>
				<i></i>
				<div>
					<span>3</span>
					<p>
						<strong
							>{route.path === 'automationSigner'
								? 'Onchain confirmation'
								: '2-of-3 approval'}</strong
						><small>Privy enforces controls</small>
					</p>
				</div>
			</div>
			<div class="security-note">
				<ShieldCheck size={18} />
				<p>
					This preview never grants permission. Privy evaluates the final policy at execution time.
				</p>
			</div>
		</aside>
	</div>
{/if}
