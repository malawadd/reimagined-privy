<script lang="ts">
	import { Check, Clock3, RefreshCw, ShieldCheck, UserCheck } from '@lucide/svelte';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { privyAuth } from '$lib/auth/privy.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const approvals = useQuery(api.approvals.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const refreshApproval = useMutation(api.approvals.refresh);
	let activeId = $state<string | null>(null);
	let error = $state<string | null>(null);
	function expiry(value: number | null) {
		if (!value) return 'Not reported';
		const ms = value < 10_000_000_000 ? value * 1000 : value;
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
			ms
		);
	}
	function detail(value: unknown) {
		return JSON.stringify(value ?? {}, null, 2);
	}
	type ApprovalRow = {
		operationId: Id<'operations'>;
		intentId: string | null;
		expiresAt: number | null;
		requestDetails: unknown;
	};
	async function approve(approval: ApprovalRow) {
		if (
			!workspace.activeOrganizationId ||
			!approval.intentId ||
			!isRequestDetails(approval.requestDetails)
		)
			return;
		activeId = approval.operationId;
		error = null;
		try {
			await privyAuth.authorizeIntent({
				organizationId: workspace.activeOrganizationId,
				intentId: approval.intentId,
				expiresAt: approval.expiresAt,
				requestDetails: approval.requestDetails
			});
			await refreshApproval({
				organizationId: workspace.activeOrganizationId,
				operationId: approval.operationId as Id<'operations'>
			});
		} catch (c) {
			error = c instanceof Error ? c.message : 'Unable to authorize intent.';
		} finally {
			activeId = null;
		}
	}
	function isRequestDetails(value: unknown): value is {
		method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
		url: string;
		body?: unknown;
	} {
		if (!value || typeof value !== 'object') return false;
		const record = value as Record<string, unknown>;
		return (
			typeof record.url === 'string' &&
			['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(record.method))
		);
	}
	async function refresh(operationId: Id<'operations'>) {
		if (!workspace.activeOrganizationId) return;
		activeId = operationId;
		try {
			await refreshApproval({ organizationId: workspace.activeOrganizationId, operationId });
		} finally {
			activeId = null;
		}
	}
</script>

<svelte:head><title>Approvals | Ratib</title></svelte:head>
<PageHeader
	eyebrow="PRIVY INTENTS"
	title="Approval inbox"
	description="Inspect, authenticate, and sign treasury and administrative intents without leaving Ratib."
/>
{#if error}<p class="form-error page-error" role="alert">{error}</p>{/if}
<div class="security-strip">
	<ShieldCheck size={20} />
	<div>
		<strong>Privy-secured authorization</strong>
		<p>
			Passkey, biometric, OTP, or MFA challenges run through Privy’s secure embedded frame. Ratib
			stores only provider status and timestamps.
		</p>
	</div>
</div>

<div class="approval-list">
	{#if approvals.isLoading}<article class="panel approval-empty">
			<Clock3 size={25} />
			<h2>Loading intents</h2>
		</article>
	{:else if approvals.error}<article class="panel approval-empty" role="alert">
			<ShieldCheck size={25} />
			<h2>Approval inbox unavailable</h2>
			<p>{approvals.error.message}</p>
		</article>
	{:else if approvals.data?.length === 0}<article class="panel approval-empty">
			<Check size={27} />
			<h2>You are caught up</h2>
			<p>
				New transfers and control changes will appear here when your Privy user quorum can authorize
				them.
			</p>
		</article>
	{:else}{#each approvals.data ?? [] as approval}<article class="panel approval-card">
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
							: 'Administrative control change'}</strong
					>
					<p>
						Requested by {approval.createdByName}{approval.destination
							? ` · to ${approval.destination.slice(0, 10)}…${approval.destination.slice(-6)}`
							: ''}
					</p>
					<div class="approval-progress">
						<div class="spread inline">
							<span><UserCheck size={15} /> Signatures</span><strong
								>{approval.approvals} of {approval.threshold || 'unknown'}</strong
							>
						</div>
						<div class="progress">
							<i
								style={`width:${approval.threshold ? Math.min(100, (approval.approvals / approval.threshold) * 100) : 0}%`}
							></i>
						</div>
					</div>
					<details>
						<summary>Inspect provider request and change</summary>
						<div class="diff-grid">
							<section>
								<span>REQUEST</span>
								<pre>{detail(approval.requestDetails)}</pre>
							</section>
							<section>
								<span>CURRENT RESOURCE</span>
								<pre>{detail(approval.currentResource)}</pre>
							</section>
						</div>
					</details>
					<div class="approval-meta">
						<span><Clock3 size={14} /> Expires {expiry(approval.expiresAt)}</span><span class="mono"
							>{approval.intentId ?? approval.operationId}</span
						>
					</div>
				</div>
				<div class="approval-actions">
					<button
						class="icon-button"
						aria-label="Refresh intent"
						title="Refresh intent"
						onclick={() => refresh(approval.operationId)}
						disabled={activeId === approval.operationId}
						><RefreshCw class={activeId === approval.operationId ? 'spin' : ''} size={15} /></button
					><button
						class="button primary"
						onclick={() => approve(approval)}
						disabled={!approval.canApprove || activeId === approval.operationId}
						><ShieldCheck size={14} />{activeId === approval.operationId
							? 'Authenticating…'
							: approval.canApprove
								? 'Review & approve'
								: 'Not eligible'}</button
					>
				</div>
			</article>{/each}{/if}
</div>

<style>
	.page-error {
		margin-bottom: 12px;
	}
	.security-strip {
		display: flex;
		gap: 12px;
		align-items: center;
		margin-bottom: 14px;
		border: 1px solid #cfe0dc;
		padding: 13px 16px;
		color: #245f51;
		background: #f2f8f5;
	}
	.security-strip p {
		margin-top: 3px;
		color: #5f7770;
		font-size: 0.67rem;
	}
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
	.approval-card {
		grid-template-columns: auto minmax(0, 1fr) auto;
	}
	.approval-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.approval-body details {
		margin-top: 14px;
		border-top: 1px solid #e0e6e8;
		padding-top: 11px;
	}
	.approval-body summary {
		color: #286052;
		font-size: 0.65rem;
		font-weight: 750;
		cursor: pointer;
	}
	.diff-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-top: 9px;
	}
	.diff-grid section {
		min-width: 0;
		border: 1px solid #e0e6e8;
		background: #f8faf9;
	}
	.diff-grid span {
		display: block;
		padding: 7px 9px;
		font-size: 0.53rem;
		font-weight: 800;
	}
	.diff-grid pre {
		max-height: 210px;
		overflow: auto;
		margin: 0;
		border-top: 1px solid #e0e6e8;
		padding: 9px;
		font-size: 0.56rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	:global(.spin) {
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (max-width: 850px) {
		.approval-card {
			grid-template-columns: auto 1fr;
		}
		.approval-actions {
			grid-column: 1/-1;
			justify-content: flex-end;
		}
		.diff-grid {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 600px) {
		.approval-card {
			grid-template-columns: 1fr;
		}
		.approval-icon {
			display: none;
		}
		.approval-actions {
			justify-content: stretch;
		}
		.approval-actions .button {
			flex: 1;
		}
	}
</style>
