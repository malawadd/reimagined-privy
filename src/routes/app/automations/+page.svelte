<script lang="ts">
	import { CalendarClock, Pause, Play, Radio, ShieldCheck, Zap } from '@lucide/svelte';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const automations = useQuery(api.automations.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const pauseAutomation = useMutation(api.automations.pause);
	const resumeAutomation = useMutation(api.automations.resume);
	const runAutomation = useMutation(api.automations.runNow);
	let workingId = $state<string | null>(null);
	let actionError = $state<string | null>(null);

	async function toggle(automation: NonNullable<typeof automations.data>[number]) {
		if (!workspace.activeOrganizationId) return;
		workingId = automation._id;
		actionError = null;
		try {
			const args = { organizationId: workspace.activeOrganizationId, automationId: automation._id };
			if (automation.status === 'active') await pauseAutomation(args);
			else await resumeAutomation(args);
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Unable to update automation.';
		} finally {
			workingId = null;
		}
	}

	async function runNow(automation: NonNullable<typeof automations.data>[number]) {
		if (!workspace.activeOrganizationId) return;
		const amount = automation.amount ? `${automation.amount} USDC` : 'the event amount';
		if (
			!confirm(
				`Run ${automation.name} now? This can submit ${amount} to ${automation.destination} through Privy.`
			)
		)
			return;
		workingId = automation._id;
		actionError = null;
		try {
			await runAutomation({
				organizationId: workspace.activeOrganizationId,
				automationId: automation._id
			});
		} catch (error) {
			actionError =
				error instanceof Error ? error.message : 'Unable to schedule this automation run.';
		} finally {
			workingId = null;
		}
	}
</script>

<svelte:head><title>Automations | Ratib</title></svelte:head>

<PageHeader
	eyebrow="DURABLE EXECUTION"
	title="Automations"
	description="Deterministic schedules and deposit events bounded by dedicated Privy signer policies."
/>

<section class="metrics three">
	<div class="metric">
		<div class="metric-icon green"><Zap /></div>
		<div>
			<span>Active definitions</span><strong
				>{automations.data?.filter((item) => item.status === 'active').length ?? 0}</strong
			><small>Policy-bound actors</small>
		</div>
	</div>
	<div class="metric">
		<div class="metric-icon blue"><Radio /></div>
		<div>
			<span>Deposit sweeps</span><strong
				>{automations.data?.filter((item) => item.type === 'depositSweep').length ?? 0}</strong
			><small>Webhook-triggered</small>
		</div>
	</div>
	<div class="metric">
		<div class="metric-icon amber"><CalendarClock /></div>
		<div>
			<span>Scheduled payments</span><strong
				>{automations.data?.filter((item) => item.type === 'recurringPayment').length ?? 0}</strong
			><small>Deterministic run keys</small>
		</div>
	</div>
</section>

<section class="panel">
	<header>
		<div>
			<h2>Automation definitions</h2>
			<p>Service principals are separate from interactive team memberships.</p>
		</div>
		<ShieldCheck size={19} />
	</header>
	{#if actionError}<p class="form-error automation-error" role="alert">{actionError}</p>{/if}
	{#if automations.isLoading}<div class="automation-empty">Loading durable definitions…</div>
	{:else if automations.error}<div class="automation-empty error" role="alert">
			{automations.error.message}
		</div>
	{:else if automations.data?.length === 0}<div class="automation-empty">
			<Zap size={25} /><strong>No automations configured</strong><span
				>Automation becomes available after this organization has an active service principal and an
				attached Privy policy.</span
			>
		</div>
	{:else}<div class="automation-list">
			{#each automations.data ?? [] as automation}<article>
					<div class="automation-icon">
						{#if automation.type === 'depositSweep'}<Radio size={19} />{:else}<CalendarClock
								size={19}
							/>{/if}
					</div>
					<div class="automation-name">
						<strong>{automation.name}</strong><small>{automation._id}</small>
					</div>
					<div>
						<span class="cell-label">TRIGGER</span><strong
							>{automation.type === 'depositSweep'
								? 'Verified deposit webhook'
								: (automation.schedule ?? 'Schedule missing')}</strong
						>
					</div>
					<div>
						<span class="cell-label">POLICY BOUNDARY</span><strong
							>{automation.policySummary}</strong
						>
					</div>
					<div>
						<StatusBadge status={automation.status} /><small
							>{automation.nextRunAt
								? new Date(automation.nextRunAt).toLocaleString()
								: 'No next run'}</small
						>
					</div>
					<div class="automation-actions">
						<button
							class="icon-button"
							aria-label={automation.status === 'active'
								? `Pause ${automation.name}`
								: `Resume ${automation.name}`}
							title={automation.status === 'active' ? 'Pause automation' : 'Resume automation'}
							disabled={workingId === automation._id}
							onclick={() => toggle(automation)}
							>{#if automation.status === 'active'}<Pause size={15} />{:else}<Play
									size={15}
								/>{/if}</button
						>{#if automation.type === 'recurringPayment'}<button
								class="icon-button"
								aria-label={`Run ${automation.name} now`}
								title="Run now"
								disabled={workingId === automation._id || automation.status !== 'active'}
								onclick={() => runNow(automation)}><Play size={15} /></button
							>{/if}
					</div>
				</article>{/each}
		</div>{/if}
</section>

<div class="two-col compact-grid">
	<section class="panel">
		<header>
			<div>
				<h2>Execution identity</h2>
				<p>Non-interactive and independently revocable.</p>
			</div>
			<ShieldCheck size={19} />
		</header>
		<div class="detail-row">
			<span>Service principal</span><strong>One per automation boundary</strong>
		</div>
		<div class="detail-row">
			<span>Authorization material</span><strong>Convex environment only</strong>
		</div>
		<div class="detail-row"><span>Claim strategy</span><strong>Atomic · at-most-once</strong></div>
	</section>
	<section class="panel">
		<header>
			<div>
				<h2>Reconciliation</h2>
				<p>Ambiguous provider results are looked up before retry.</p>
			</div>
			<StatusBadge status="active" />
		</header>
		<div class="detail-row"><span>Executable network</span><strong>Base Sepolia</strong></div>
		<div class="detail-row">
			<span>Retry behavior</span><strong>Lookup before side effect</strong>
		</div>
		<div class="detail-row"><span>Audit trail</span><strong>Append only</strong></div>
	</section>
</div>

<style>
	.automation-empty {
		display: grid;
		min-height: 240px;
		place-items: center;
		align-content: center;
		gap: 8px;
		padding: 30px;
		color: #718087;
		font-size: 0.72rem;
		text-align: center;
	}
	.automation-empty :global(svg) {
		color: #367663;
	}
	.automation-empty strong {
		color: #2e4047;
		font-family: Georgia, serif;
		font-size: 1.2rem;
	}
	.automation-empty span {
		max-width: 540px;
		line-height: 1.55;
	}
	.automation-empty.error {
		color: #9d4038;
	}
	.automation-actions {
		display: flex;
		gap: 5px;
	}
	.automation-error {
		margin: 12px 18px;
	}
</style>
