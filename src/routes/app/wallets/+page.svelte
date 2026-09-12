<script lang="ts">
	import {
		Copy,
		ExternalLink,
		KeyRound,
		Plus,
		RefreshCw,
		Settings2,
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
	const createWallet = useMutation(api.wallets.create);
	const renameWallet = useMutation(api.wallets.requestDisplayNameUpdate);
	const changeThreshold = useMutation(api.wallets.requestApprovalThreshold);
	let refreshingWalletId = $state<string | null>(null);
	let showingCreate = $state(false);
	let walletName = $state('');
	let createError = $state<string | null>(null);
	let creating = $state(false);
	let controlError = $state<string | null>(null);
	function userError(caught: unknown, fallback: string) {
		if (!(caught instanceof Error)) return fallback;
		return (
			caught.message.match(/Uncaught Error:\s*(.*?)(?=\s+at\s+(?:async\s+)?[\w$]+\s*\(|$)/s)?.[1] ??
			caught.message
		);
	}

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
	async function submitWallet() {
		if (!workspace.activeOrganizationId) return;
		creating = true;
		createError = null;
		try {
			await createWallet({
				organizationId: workspace.activeOrganizationId,
				name: walletName,
				requestKey: crypto.randomUUID()
			});
			walletName = '';
			showingCreate = false;
		} catch (caught) {
			createError = userError(caught, 'Unable to create wallet.');
		} finally {
			creating = false;
		}
	}
	async function submitRename(
		event: SubmitEvent,
		walletId: NonNullable<typeof wallets.data>[number]['wallet']['_id']
	) {
		if (!workspace.activeOrganizationId) return;
		const form = new FormData(event.currentTarget as HTMLFormElement);
		try {
			controlError = null;
			await renameWallet({
				organizationId: workspace.activeOrganizationId,
				walletId,
				name: String(form.get('name') ?? '')
			});
		} catch (caught) {
			controlError = userError(caught, 'Unable to request wallet rename.');
		}
	}
	async function submitThreshold(
		event: SubmitEvent,
		walletId: NonNullable<typeof wallets.data>[number]['wallet']['_id']
	) {
		if (!workspace.activeOrganizationId) return;
		const form = new FormData(event.currentTarget as HTMLFormElement);
		try {
			controlError = null;
			await changeThreshold({
				organizationId: workspace.activeOrganizationId,
				walletId,
				threshold: Number(form.get('threshold'))
			});
		} catch (caught) {
			controlError = userError(caught, 'Unable to request threshold change.');
		}
	}
</script>

<svelte:head><title>Wallets | Ratib</title></svelte:head>

<PageHeader
	eyebrow="TREASURY ACCOUNTS"
	title="Wallets"
	description="Live Privy wallet inventory, balances, ownership, signers, and attached controls."
>
	{#snippet action()}<button class="button primary" onclick={() => (showingCreate = true)}
			><Plus size={15} /> New wallet</button
		>{/snippet}
</PageHeader>

{#if !workspace.activeOrganizationId}
	<section class="panel wallet-empty">
		<WalletCards size={28} />
		<h2>No active organization</h2>
		<p>Create an organization to provision its first treasury wallet.</p>
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
		<p>Set up the organization treasury or create a wallet directly here.</p>
		<button class="button primary" onclick={() => (showingCreate = true)}
			>Create treasury wallet</button
		>
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
			<details class="panel wallet-controls">
				<summary
					><span><Settings2 size={15} /> Manage {row.wallet.name}</span><small
						>Changes route through Privy intents</small
					></summary
				>
				<div>
					<form
						onsubmit={(event) => {
							event.preventDefault();
							void submitRename(event, row.wallet._id);
						}}
					>
						<label for={`wallet-name-${row.wallet._id}`}>Display name</label>
						<div>
							<input
								id={`wallet-name-${row.wallet._id}`}
								name="name"
								value={row.wallet.name}
								maxlength="100"
								required
							/><button class="button secondary">Request rename</button>
						</div>
					</form>
					<form
						onsubmit={(event) => {
							event.preventDefault();
							void submitThreshold(event, row.wallet._id);
						}}
					>
						<label for={`wallet-threshold-${row.wallet._id}`}>Approval threshold</label>
						<div>
							<input
								id={`wallet-threshold-${row.wallet._id}`}
								name="threshold"
								type="number"
								min="1"
								value={row.wallet.approvalThreshold ?? 1}
								required
							/><button class="button secondary">Request threshold</button>
						</div>
					</form>
					<a class="button secondary" href="/app/team">Manage members & permissions</a>
				</div>
				{#if controlError}<p class="form-error" role="alert">{controlError}</p>{/if}
			</details>
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
								? `${summary.data.quorum.threshold} of ${summary.data.quorum.reviewerCount} embedded reviewers${summary.data.quorum.mfaRequired ? ' · MFA required' : ''}`
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

{#if showingCreate}<div class="wallet-modal">
		<form
			class="wallet-dialog"
			onsubmit={(event) => {
				event.preventDefault();
				void submitWallet();
			}}
		>
			<p class="eyebrow">BASE SEPOLIA</p>
			<h2>Create treasury wallet</h2>
			<p>
				Ratib will provision a user quorum and default ETH/USDC owner policy before creating the
				Privy wallet.
			</p>
			<label for="wallet-name">Wallet name</label><input
				id="wallet-name"
				bind:value={walletName}
				maxlength="100"
				required
			/>{#if createError}<p class="form-error" role="alert">{createError}</p>{/if}
			<div>
				<button type="button" class="button secondary" onclick={() => (showingCreate = false)}
					>Cancel</button
				><button class="button primary" disabled={creating}
					>{creating ? 'Starting…' : 'Create wallet'}</button
				>
			</div>
		</form>
	</div>{/if}

<style>
	.wallet-stack {
		display: grid;
		gap: 14px;
	}
	.wallet-controls {
		overflow: hidden;
	}
	.wallet-controls summary {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 13px 18px;
		cursor: pointer;
	}
	.wallet-controls summary span {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 0.7rem;
		font-weight: 750;
	}
	.wallet-controls summary small {
		color: #75838a;
		font-size: 0.6rem;
	}
	.wallet-controls > div {
		display: grid;
		grid-template-columns: 1fr 1fr auto;
		gap: 14px;
		align-items: end;
		border-top: 1px solid #e0e6e8;
		padding: 16px 18px;
	}
	.wallet-controls form {
		display: grid;
		gap: 6px;
	}
	.wallet-controls form label {
		font-size: 0.62rem;
		font-weight: 750;
	}
	.wallet-controls form div {
		display: flex;
		gap: 6px;
	}
	.wallet-controls input {
		min-width: 0;
		width: 100%;
		border: 1px solid #d5dee1;
		border-radius: 4px;
		padding: 8px;
		font: inherit;
		font-size: 0.68rem;
	}
	.wallet-controls > .form-error {
		margin: 0 18px 16px;
	}
	@media (max-width: 800px) {
		.wallet-controls > div {
			grid-template-columns: 1fr;
		}
		.wallet-controls summary {
			align-items: flex-start;
			flex-direction: column;
			gap: 4px;
		}
	}
	.wallet-modal {
		position: fixed;
		z-index: 100;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgba(8, 27, 35, 0.68);
	}
	.wallet-dialog {
		display: grid;
		width: min(500px, 100%);
		border-radius: 7px;
		padding: 28px;
		background: #fff;
	}
	.wallet-dialog h2 {
		margin: 8px 0;
		font-family: Georgia, serif;
		font-size: 1.5rem;
		font-weight: 500;
	}
	.wallet-dialog > p:not(.eyebrow) {
		color: #6d7c82;
		font-size: 0.72rem;
		line-height: 1.6;
	}
	.wallet-dialog label {
		margin: 16px 0 6px;
		font-size: 0.67rem;
		font-weight: 750;
	}
	.wallet-dialog input {
		border: 1px solid #d5dee1;
		border-radius: 5px;
		padding: 10px;
		font: inherit;
	}
	.wallet-dialog > div {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 18px;
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
