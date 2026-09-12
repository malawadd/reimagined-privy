<script lang="ts">
	import {
		Copy,
		ExternalLink,
		KeyRound,
		RefreshCw,
		ShieldCheck,
		WalletCards
	} from '@lucide/svelte';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { BASE_SEPOLIA } from '$lib/domain';
	import { workspace } from '$lib/workspace.svelte';

	const wallets = useQuery(api.wallets.listWithBalances, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const policies = useQuery(api.policies.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const summary = useQuery(api.dashboard.get, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const refreshBalances = useMutation(api.wallets.refreshBalances);
	let refreshingWalletId = $state<string | null>(null);

	function balance(row: NonNullable<typeof wallets.data>[number], asset: 'ETH' | 'USDC') {
		return row.balances.find((item) => item.asset === asset);
	}

	async function refresh(walletId: NonNullable<typeof wallets.data>[number]['wallet']['_id']) {
		if (!workspace.activeOrganizationId) return;
		refreshingWalletId = walletId;
		try {
			await refreshBalances({ organizationId: workspace.activeOrganizationId, walletId });
		} finally {
			refreshingWalletId = null;
		}
	}

	async function copyAddress(address: string) {
		await navigator.clipboard.writeText(address);
	}
</script>

<svelte:head><title>Wallets | Ratib</title></svelte:head>

<PageHeader
	eyebrow="TREASURY ACCOUNTS"
	title="Wallets"
	description="Live Privy wallet inventory, balances, ownership, signers, and attached controls."
>
	{#snippet action()}<a class="button secondary" href="/app/setup">Provisioning settings</a
		>{/snippet}
</PageHeader>

{#if !workspace.activeOrganizationId}
	<section class="panel wallet-empty">
		<WalletCards size={28} />
		<h2>No active organization</h2>
		<p>A pilot workspace must be assigned before wallets can be provisioned.</p>
	</section>
{:else if wallets.isLoading}
	<section class="panel wallet-empty">
		<RefreshCw class="spin" size={24} />
		<h2>Loading Privy wallets</h2>
	</section>
{:else if wallets.error}
	<section class="panel wallet-empty" role="alert">
		<ShieldCheck size={27} />
		<h2>Wallet inventory unavailable</h2>
		<p>{wallets.error.message}</p>
	</section>
{:else if wallets.data?.length === 0}
	<section class="panel wallet-empty">
		<WalletCards size={28} />
		<h2>No treasury wallets provisioned</h2>
		<p>
			Ratib only enables live wallets after the business and its Privy reviewer authority have been
			verified.
		</p>
		<a class="button primary" href="/app/setup">Review pilot setup</a>
	</section>
{:else}
	<div class="wallet-stack">
		{#each wallets.data ?? [] as row}
			<section class="panel wallet-hero">
				<div class="wallet-main">
					<div class="wallet-emblem"><WalletCards size={25} /></div>
					<div>
						<div class="inline">
							<h2>{row.wallet.name}</h2>
							<StatusBadge status="ready" />
						</div>
						<p class="mono">
							{row.wallet.address}
							<button aria-label="Copy address" onclick={() => copyAddress(row.wallet.address)}
								><Copy size={14} /></button
							>
						</p>
						<small>{row.wallet.privyWalletId} · {BASE_SEPOLIA.caip2}</small>
					</div>
				</div>
				<div class="wallet-balances">
					<div>
						<span>USDC balance</span><strong
							>{balance(row, 'USDC')?.displayValue ?? 'Not loaded'}</strong
						><small
							>USDC · {balance(row, 'USDC')
								? `observed ${new Date(balance(row, 'USDC')!.observedAt).toLocaleString()}`
								: 'refresh required'}</small
						>
					</div>
					<div>
						<span>Native gas</span><strong
							>{balance(row, 'ETH')?.displayValue ?? 'Not loaded'}</strong
						><small>ETH · Base Sepolia</small>
					</div>
					<button
						class="icon-button"
						aria-label={`Refresh ${row.wallet.name} balances`}
						title="Refresh balances from Privy"
						disabled={refreshingWalletId === row.wallet._id}
						onclick={() => refresh(row.wallet._id)}
						><RefreshCw
							class={refreshingWalletId === row.wallet._id ? 'spin' : ''}
							size={16}
						/></button
					>
				</div>
			</section>
		{/each}
	</div>

	<div class="two-col">
		<section class="panel">
			<header>
				<div>
					<h2>Authorization topology</h2>
					<p>Privy remains the final signing authority.</p>
				</div>
				<ShieldCheck size={19} />
			</header>
			<div class="topology">
				<div class="topology-node primary-node">
					<span><ShieldCheck size={18} /></span>
					<div>
						<strong>Management quorum</strong><small
							>{summary.data?.quorum
								? `${summary.data.quorum.threshold} of ${summary.data.quorum.reviewerCount} Dashboard reviewers${summary.data.quorum.mfaRequired ? ' · MFA required' : ''}`
								: 'Quorum has not been synchronized'}</small
						>
					</div>
				</div>
				<i></i>
				<div class="topology-split">
					<div class="topology-node">
						<span><KeyRound size={18} /></span>
						<div>
							<strong>Wallet owner</strong><small
								>{wallets.data?.[0]?.wallet.ownerQuorumId ?? 'Unavailable'}</small
							>
						</div>
					</div>
					<div class="topology-node">
						<span><ShieldCheck size={18} /></span>
						<div>
							<strong>Attached policies</strong><small
								>{wallets.data?.[0]?.wallet.policyIds.length ?? 0} Privy policy IDs</small
							>
						</div>
					</div>
				</div>
			</div>
			<div class="detail-row">
				<span>Automation signers</span><strong
					>{wallets.data?.reduce((total, row) => total + row.wallet.signerIds.length, 0) ??
						0}</strong
				>
			</div>
			<div class="detail-row">
				<span>Executable network</span><strong>Base Sepolia · 84532</strong>
			</div>
			<div class="detail-row">
				<span>Last provider sync</span><strong
					>{wallets.data?.[0]
						? new Date(wallets.data[0].wallet.syncedAt).toLocaleString()
						: 'Never'}</strong
				>
			</div>
		</section>
		<section class="panel">
			<header>
				<div>
					<h2>Attached controls</h2>
					<p>Mirrored for explanation; changes use native Privy intents.</p>
				</div>
				<a href="/app/policies">Manage <ExternalLink size={13} /></a>
			</header>
			{#if policies.data?.length}
				{#each policies.data as policy}<div class="control-card">
						<div>
							<span>{policy.kind.toUpperCase()}</span>
							<h3>{policy.name}</h3>
							<p>Version {policy.version} · {policy.privyPolicyId}</p>
						</div>
						<StatusBadge status={policy.status} />
					</div>{/each}
			{:else}<div class="inline-empty">
					No policy mirrors are available for this organization.
				</div>{/if}
			<div class="security-note">
				<ShieldCheck size={18} />
				<p>
					<strong>Default deny is enforced.</strong> Ratib never treats its local route preview as permission
					to sign.
				</p>
			</div>
		</section>
	</div>
{/if}

<style>
	.wallet-stack {
		display: grid;
		gap: 14px;
	}
	.wallet-empty {
		display: grid;
		min-height: 300px;
		place-items: center;
		align-content: center;
		gap: 10px;
		padding: 35px;
		text-align: center;
	}
	.wallet-empty :global(svg) {
		color: #3c7868;
	}
	.wallet-empty h2 {
		font-family: Georgia, serif;
		font-size: 1.35rem;
	}
	.wallet-empty p {
		max-width: 510px;
		color: #6f7e84;
		font-size: 0.78rem;
		line-height: 1.6;
	}
	.wallet-balances {
		position: relative;
		padding-right: 48px;
	}
	.wallet-balances > button {
		position: absolute;
		top: 50%;
		right: 12px;
		transform: translateY(-50%);
	}
	.inline-empty {
		padding: 36px 12px;
		color: #748188;
		font-size: 0.75rem;
		text-align: center;
	}
	:global(.spin) {
		animation: spin 0.85s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
