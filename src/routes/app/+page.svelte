<script lang="ts">
	import {
		ArrowRight,
		ArrowUpRight,
		CheckCircle2,
		CircleDollarSign,
		Clock3,
		ShieldCheck,
		Users,
		WalletCards,
		Zap
	} from '@lucide/svelte';
	import { useQuery } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { privyAuth } from '$lib/auth/privy.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const summary = useQuery(api.dashboard.get, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);

	let setupSteps = $derived([
		{ name: 'Treasury wallet', done: (summary.data?.walletCount ?? 0) > 0 },
		{ name: 'Active Privy policy', done: (summary.data?.policyCount ?? 0) > 0 },
		{ name: 'Reviewer quorum', done: Boolean(summary.data?.quorum) },
		{ name: 'Finance team', done: (summary.data?.memberCount ?? 0) > 1 }
	]);
	let completedSteps = $derived(setupSteps.filter((step) => step.done).length);

	function operationAmount(operation: { asset?: 'ETH' | 'USDC'; amount?: string }) {
		return operation.amount && operation.asset
			? `${operation.amount} ${operation.asset}`
			: 'Control update';
	}

	function relativeTime(value: number) {
		const difference = Date.now() - value;
		const minutes = Math.max(1, Math.floor(difference / 60_000));
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value);
	}
</script>

<svelte:head><title>Overview | Ratib</title></svelte:head>

<PageHeader
	eyebrow={new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
		.format(new Date())
		.toUpperCase()}
	title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${privyAuth.user?.name ?? 'operator'}`}
	description="The live operating state of your organization wallets and money movement."
>
	{#snippet action()}<a class="button secondary" href="/app/payments"
			>New payment <ArrowUpRight size={16} /></a
		>{/snippet}
</PageHeader>

{#if !workspace.activeOrganizationId}
	<section class="panel empty-state">
		<Users size={28} />
		<h2>No active organization</h2>
		<p>Your identity is authenticated, but it has not been assigned to a Ratib pilot workspace.</p>
		<a class="button primary" href="/app/setup">Request pilot access <ArrowRight size={15} /></a>
	</section>
{:else if summary.isLoading}
	<section class="loading-grid" aria-label="Loading organization overview">
		<div></div>
		<div></div>
		<div></div>
		<div></div>
	</section>
{:else if summary.error}
	<section class="panel empty-state" role="alert">
		<ShieldCheck size={28} />
		<h2>Workspace data is unavailable</h2>
		<p>{summary.error.message}</p>
	</section>
{:else if summary.data}
	<section class="metrics four">
		<div class="metric">
			<div class="metric-icon blue"><WalletCards /></div>
			<div>
				<span>Treasury wallets</span><strong>{summary.data.walletCount}</strong><small
					>Provider-backed accounts</small
				>
			</div>
		</div>
		<div class="metric">
			<div class="metric-icon amber"><Clock3 /></div>
			<div>
				<span>Pending approvals</span><strong>{summary.data.pendingApprovalCount}</strong><small
					>Awaiting Privy authority</small
				>
			</div>
		</div>
		<div class="metric">
			<div class="metric-icon green"><Zap /></div>
			<div>
				<span>Active automations</span><strong>{summary.data.activeAutomationCount}</strong><small
					>Policy-bounded definitions</small
				>
			</div>
		</div>
		<div class="metric">
			<div class="metric-icon violet"><ShieldCheck /></div>
			<div>
				<span>Reviewer quorum</span><strong
					>{summary.data.quorum
						? `${summary.data.quorum.threshold} of ${summary.data.quorum.reviewerCount}`
						: 'Not synced'}</strong
				><small
					>{summary.data.quorum?.mfaRequired
						? 'MFA required by Privy'
						: 'Verify in Privy Dashboard'}</small
				>
			</div>
		</div>
	</section>

	<div class="dashboard-grid">
		<section class="panel activity-panel">
			<header>
				<div>
					<h2>Recent operations</h2>
					<p>Realtime lifecycle from creation through settlement.</p>
				</div>
				<a href="/app/audit">View audit log <ArrowRight size={14} /></a>
			</header>
			{#if summary.data.recentOperations.length === 0}
				<div class="table-empty">
					<CircleDollarSign size={24} /><strong>No operations yet</strong><span
						>Payments and control changes will appear here after they are submitted.</span
					>
				</div>
			{:else}
				<div class="table-wrap">
					<table>
						<thead
							><tr
								><th>Operation</th><th>Amount</th><th>Control path</th><th>Status</th><th
									>Updated</th
								></tr
							></thead
						><tbody>
							{#each summary.data.recentOperations as operation}<tr>
									<td
										><div class="table-title">
											<span class="row-icon"><CircleDollarSign size={17} /></span>
											<div>
												<strong>{operation.reference}</strong><small
													>{operation.kind} · {operation._id}</small
												>
											</div>
										</div></td
									>
									<td class="amount">{operationAmount(operation)}</td><td
										>{operation.approvalPath === 'privyIntent'
											? 'Privy intent'
											: operation.approvalPath === 'automationSigner'
												? 'Policy signer'
												: 'System control'}</td
									><td><StatusBadge status={operation.status} /></td><td
										>{relativeTime(operation.updatedAt)}</td
									>
								</tr>{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
		<aside class="side-stack">
			<section class="panel setup-card">
				<header>
					<div>
						<h2>Launch readiness</h2>
						<p>{completedSteps} of {setupSteps.length} controls configured</p>
					</div>
					<strong>{Math.round((completedSteps / setupSteps.length) * 100)}%</strong>
				</header>
				<div class="progress">
					<i style={`width:${(completedSteps / setupSteps.length) * 100}%`}></i>
				</div>
				{#each setupSteps as step}<div class="check-row">
						<span class:done={step.done}
							>{#if step.done}<CheckCircle2 size={13} />{/if}</span
						>
						<div>
							<strong>{step.name}</strong><small
								>{step.done ? 'Configured' : 'Action required'}</small
							>
						</div>
					</div>{/each}
				<a class="text-link" href="/app/setup">Review setup <ArrowRight size={14} /></a>
			</section>
			<section class="panel chain-card">
				<div class="chain-head">
					<span class="base-logo">B</span>
					<div>
						<h3>Base Sepolia</h3>
						<p>Chain ID 84532</p>
					</div>
					<StatusBadge status="ready" />
				</div>
				<div class="gas-row"><span>Execution scope</span><strong>Testnet only</strong></div>
				<p class="chain-note">
					Balances are read from configured provider-backed wallets; no mainnet fallback is enabled.
				</p>
			</section>
		</aside>
	</div>
{/if}

<style>
	.empty-state,
	.table-empty {
		display: grid;
		place-items: center;
		text-align: center;
	}
	.empty-state {
		min-height: 330px;
		padding: 40px;
	}
	.empty-state :global(svg),
	.table-empty :global(svg) {
		color: #397365;
	}
	.empty-state h2 {
		margin-top: 15px;
		font-family: Georgia, serif;
		font-size: 1.45rem;
	}
	.empty-state p {
		max-width: 500px;
		margin: 8px 0 20px;
		color: #6f7e85;
		font-size: 0.8rem;
		line-height: 1.6;
	}
	.loading-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 12px;
	}
	.loading-grid div {
		height: 105px;
		border: 1px solid #e1e6e8;
		background: #edf1f2;
		animation: pulse 1.2s ease-in-out infinite alternate;
	}
	.table-empty {
		min-height: 230px;
		padding: 30px;
		color: #6d7d83;
	}
	.table-empty strong {
		margin-top: 10px;
		color: #2b3c43;
	}
	.table-empty span {
		max-width: 400px;
		margin-top: 5px;
		font-size: 0.72rem;
		line-height: 1.5;
	}
	.chain-note {
		margin-top: 15px;
		color: #77858b;
		font-size: 0.68rem;
		line-height: 1.55;
	}
	@keyframes pulse {
		to {
			opacity: 0.48;
		}
	}
	@media (max-width: 900px) {
		.loading-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (max-width: 560px) {
		.loading-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
