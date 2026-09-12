<script lang="ts">
	import { Clock3, ExternalLink, ShieldCheck, UserCheck } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { approvals } from '$lib/mock-data';
</script>

<PageHeader
	eyebrow="PRIVY INTENTS"
	title="Approval inbox"
	description="A local mirror of approval progress. Review and sign only in the Privy Dashboard."
>
	{#snippet action()}<a
			class="button secondary"
			href="https://dashboard.privy.io/apps"
			target="_blank"
			rel="noreferrer">Open Privy approvals <ExternalLink size={15} /></a
		>{/snippet}
</PageHeader>

<div class="approval-list">
	{#each approvals as approval}
		<article class="panel approval-card">
			<div class="approval-icon"><ShieldCheck size={22} /></div>
			<div class="approval-body">
				<div class="spread inline">
					<div>
						<p class="eyebrow">{approval.id}</p>
						<h2>{approval.title}</h2>
					</div>
					<StatusBadge status="pendingApproval" />
				</div>
				<strong class="approval-amount">{approval.amount}</strong>
				<p>Requested by {approval.createdBy}</p>
				<div class="approval-progress">
					<div class="spread inline">
						<span><UserCheck size={15} /> Approval progress</span><strong
							>{approval.progress} of {approval.required}</strong
						>
					</div>
					<div class="progress">
						<i style={`width:${(approval.progress / approval.required) * 100}%`}></i>
					</div>
				</div>
				<div class="approval-meta">
					<span><Clock3 size={14} /> Expires {approval.expires}</span><span
						>Wallet · Operating Treasury</span
					>
				</div>
			</div>
			<a
				class="button primary"
				href="https://dashboard.privy.io/apps"
				target="_blank"
				rel="noreferrer">Review in Privy <ExternalLink size={14} /></a
			>
		</article>
	{/each}
	<div class="explain-card">
		<ShieldCheck size={20} />
		<div>
			<strong>Application role ≠ signing authority</strong>
			<p>
				An app approver can see this inbox. Only members of the configured Privy Dashboard reviewer
				quorum can approve, and Privy requires their MFA.
			</p>
		</div>
	</div>
</div>
