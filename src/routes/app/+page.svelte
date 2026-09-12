<script lang="ts">
	import {
		ArrowUpRight,
		CircleDollarSign,
		Clock3,
		ShieldCheck,
		WalletCards,
		Zap,
		ArrowRight
	} from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { operations, organization, setupSteps } from '$lib/mock-data';
	const setupComplete = setupSteps.filter((step) => step.done).length;
</script>

<svelte:head><title>Overview — Northstar Operations</title></svelte:head>

<PageHeader
	eyebrow="FRIDAY, SEPTEMBER 12"
	title="Good morning, Avery"
	description="Here's what needs attention across Northstar's treasury."
>
	{#snippet action()}<a class="button secondary" href="/app/payments"
			>New payment <ArrowUpRight size={16} /></a
		>{/snippet}
</PageHeader>

<section class="metrics four">
	<div class="metric">
		<div class="metric-icon blue"><WalletCards /></div>
		<div>
			<span>Total treasury balance</span><strong>$48,250.00</strong><small
				>+ {organization.wallet.eth} ETH on Base Sepolia</small
			>
		</div>
	</div>
	<div class="metric">
		<div class="metric-icon amber"><Clock3 /></div>
		<div>
			<span>Pending approvals</span><strong>2</strong><small>$4,800.00 awaiting quorum</small>
		</div>
	</div>
	<div class="metric">
		<div class="metric-icon green"><Zap /></div>
		<div>
			<span>Automation health</span><strong>Healthy</strong><small>2 active · 0 runs delayed</small>
		</div>
	</div>
	<div class="metric">
		<div class="metric-icon violet"><ShieldCheck /></div>
		<div>
			<span>Control posture</span><strong>2 of 3</strong><small
				>Reviewer quorum · MFA enforced</small
			>
		</div>
	</div>
</section>

<div class="dashboard-grid">
	<section class="panel activity-panel">
		<header>
			<div>
				<h2>Recent activity</h2>
				<p>Live lifecycle across payments and treasury operations.</p>
			</div>
			<a href="/app/audit">View audit log <ArrowRight size={14} /></a>
		</header>
		<div class="table-wrap">
			<table>
				<thead
					><tr
						><th>Operation</th><th>Amount</th><th>Control path</th><th>Status</th><th>Time</th></tr
					></thead
				><tbody>
					{#each operations as operation}
						<tr
							><td
								><div class="table-title">
									<span class="row-icon"><CircleDollarSign size={17} /></span>
									<div>
										<strong>{operation.title}</strong><small
											>{operation.kind} · {operation.id}</small
										>
									</div>
								</div></td
							><td class="amount">{operation.amount}</td><td>{operation.path}</td><td
								><StatusBadge status={operation.status} /></td
							><td>{operation.time}</td></tr
						>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
	<aside class="side-stack">
		<section class="panel setup-card">
			<header>
				<div>
					<h2>Launch readiness</h2>
					<p>{setupComplete} of {setupSteps.length} controls configured</p>
				</div>
				<strong>{Math.round((setupComplete / setupSteps.length) * 100)}%</strong>
			</header>
			<div class="progress">
				<i style={`width:${(setupComplete / setupSteps.length) * 100}%`}></i>
			</div>
			{#each setupSteps.slice(0, 4) as step}<div class="check-row">
					<span class:done={step.done}>{step.done ? '✓' : ''}</span>
					<div><strong>{step.name}</strong><small>{step.detail}</small></div>
				</div>{/each}
			<a class="text-link" href="/app/setup">Finish setup <ArrowRight size={14} /></a>
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
			<div class="gas-row"><span>Gas reserve</span><strong>2.4187 ETH</strong></div>
			<div class="gas-track"><i></i></div>
			<small>Healthy for approximately 1,200 operations</small>
		</section>
	</aside>
</div>
