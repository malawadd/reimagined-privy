<script lang="ts">
	import { Copy, ExternalLink, KeyRound, ShieldCheck, WalletCards } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { organization } from '$lib/mock-data';
	import { BASE_SEPOLIA } from '$lib/domain';
</script>

<PageHeader
	eyebrow="TREASURY CONTROL"
	title="Wallets"
	description="Provider-backed wallet inventory, ownership, signer, policy, and balance mirrors."
>
	{#snippet action()}<button class="button primary">Provision wallet</button>{/snippet}
</PageHeader>

<section class="panel wallet-hero">
	<div class="wallet-main">
		<div class="wallet-emblem"><WalletCards size={25} /></div>
		<div>
			<div class="inline">
				<h2>{organization.wallet.name}</h2>
				<StatusBadge status="ready" />
			</div>
			<p class="mono">
				{organization.wallet.address} <button aria-label="Copy address"><Copy size={14} /></button>
			</p>
			<small>{organization.wallet.id} · {BASE_SEPOLIA.caip2}</small>
		</div>
	</div>
	<div class="wallet-balances">
		<div>
			<span>USDC balance</span><strong>{organization.wallet.usdc}</strong><small>USDC</small>
		</div>
		<div><span>Native gas</span><strong>{organization.wallet.eth}</strong><small>ETH</small></div>
	</div>
</section>

<div class="two-col">
	<section class="panel">
		<header>
			<div>
				<h2>Authorization topology</h2>
				<p>Privy is the final authorization authority.</p>
			</div>
			<ShieldCheck size={19} />
		</header>
		<div class="topology">
			<div class="topology-node primary-node">
				<span><ShieldCheck size={18} /></span>
				<div>
					<strong>Management quorum</strong><small>2 of 3 Dashboard reviewers · MFA required</small>
				</div>
			</div>
			<i></i>
			<div class="topology-split">
				<div class="topology-node">
					<span><KeyRound size={18} /></span>
					<div><strong>Wallet owner</strong><small>Owner of wallet updates</small></div>
				</div>
				<div class="topology-node">
					<span><ShieldCheck size={18} /></span>
					<div><strong>Policy owner</strong><small>Owner of policy updates</small></div>
				</div>
			</div>
		</div>
		<div class="detail-row">
			<span>Automation signer</span><strong
				>auth_key_01JQ5…72B <StatusBadge status="active" /></strong
			>
		</div>
		<div class="detail-row">
			<span>Signer override</span><strong>USDC ≤ 100 · approved recipients</strong>
		</div>
		<div class="detail-row">
			<span>Sweep signer rule</span><strong>Treasury destination only</strong>
		</div>
	</section>
	<section class="panel">
		<header>
			<div>
				<h2>Attached controls</h2>
				<p>Mirrored from Privy for explanation only.</p>
			</div>
			<a href="/app/policies">Manage <ExternalLink size={13} /></a>
		</header>
		<div class="control-card">
			<div>
				<span>OWNER POLICY</span>
				<h3>Base Sepolia treasury controls</h3>
				<p>ETH and USDC transfers · high owner ceilings</p>
			</div>
			<StatusBadge status="active" />
		</div>
		<div class="control-card">
			<div>
				<span>SIGNER OVERRIDE</span>
				<h3>Vendor automation — v3</h3>
				<p>USDC · 8 recipients · 100 USDC ceiling</p>
			</div>
			<StatusBadge status="active" />
		</div>
		<div class="security-note">
			<ShieldCheck size={18} />
			<p>
				<strong>Default deny is enforced.</strong> Unlisted chains, methods, assets, contracts, and recipients
				are blocked by Privy.
			</p>
		</div>
	</section>
</div>
