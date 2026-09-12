<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { Clock3, ExternalLink, ShieldCheck, UserCheck } from '@lucide/svelte';
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const approvals = useQuery(api.approvals.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const dashboardUrl =
		env.PUBLIC_PRIVY_DASHBOARD_APPROVALS_URL || 'https://dashboard.privy.io/apps';

	function expiry(value: number | null) {
		if (!value) return 'Not reported';
		const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
			milliseconds
		);
	}
</script>

<svelte:head><title>Approvals | Ratib</title></svelte:head>

<PageHeader
	eyebrow="PRIVY INTENTS"
	title="Approval inbox"
	description="A live local mirror of approval progress. Review and sign only in the Privy Dashboard."
>
	{#snippet action()}<a
			class="button secondary"
			href={dashboardUrl}
			target="_blank"
			rel="noreferrer">Open Privy approvals <ExternalLink size={15} /></a
		>{/snippet}
</PageHeader>

<div class="approval-list">
	{#if approvals.isLoading}
		<article class="panel approval-empty">
			<Clock3 size={25} />
			<h2>Loading approval intents</h2>
		</article>
	{:else if approvals.error}
		<article class="panel approval-empty" role="alert">
			<ShieldCheck size={25} />
			<h2>Approval mirror unavailable</h2>
			<p>{approvals.error.message}</p>
		</article>
	{:else if approvals.data?.length === 0}
		<article class="panel approval-empty">
			<ShieldCheck size={27} />
			<h2>No intents awaiting approval</h2>
			<p>
				New Privy-controlled transfers and administrative updates will appear here after submission.
			</p>
		</article>
	{:else}
		{#each approvals.data ?? [] as approval}
			<article class="panel approval-card">
				<div class="approval-icon"><ShieldCheck size={22} /></div>
				<div class="approval-body">
					<div class="spread inline">
						<div>
							<p class="eyebrow">{approval.intentType ?? 'PRIVY INTENT'}</p>
							<h2>{approval.reference}</h2>
						</div>
						<StatusBadge status="pendingApproval" />
					</div>
					<strong class="approval-amount"
						>{approval.amount && approval.asset
							? `${approval.amount} ${approval.asset}`
							: 'Control update'}</strong
					>
					<p>
						Requested by {approval.createdByName}{approval.destination
							? ` · to ${approval.destination.slice(0, 10)}…${approval.destination.slice(-6)}`
							: ''}
					</p>
					<div class="approval-progress">
						<div class="spread inline">
							<span><UserCheck size={15} /> Approval progress</span><strong
								>{approval.approvals} of {approval.threshold || 'unknown'}</strong
							>
						</div>
						<div class="progress">
							<i
								style={`width:${approval.threshold ? Math.min(100, (approval.approvals / approval.threshold) * 100) : 0}%`}
							></i>
						</div>
					</div>
					<div class="approval-meta">
						<span><Clock3 size={14} /> Expires {expiry(approval.expiresAt)}</span><span class="mono"
							>{approval.intentId ?? approval.operationId}</span
						>
					</div>
				</div>
				<a class="button primary" href={dashboardUrl} target="_blank" rel="noreferrer"
					>Review in Privy <ExternalLink size={14} /></a
				>
			</article>
		{/each}
	{/if}
	<div class="explain-card">
		<ShieldCheck size={20} />
		<div>
			<strong>Application role ≠ signing authority</strong>
			<p>
				An app approver can inspect this inbox. Only configured Privy Dashboard quorum members can
				approve, and Privy applies the final authentication requirements.
			</p>
		</div>
	</div>
</div>

<style>
	.approval-empty {
		display: grid;
		min-height: 270px;
		place-items: center;
		align-content: center;
		gap: 10px;
		padding: 35px;
		text-align: center;
	}
	.approval-empty :global(svg) {
		color: #3c7868;
	}
	.approval-empty h2 {
		font-family: Georgia, serif;
		font-size: 1.35rem;
	}
	.approval-empty p {
		max-width: 510px;
		color: #6d7b82;
		font-size: 0.75rem;
		line-height: 1.6;
	}
</style>
