<script lang="ts">
	import { CalendarClock, Play, Plus, Radio, ShieldCheck, Zap } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { automations } from '$lib/mock-data';
	let dryRun = $state(false);
</script>

<PageHeader
	eyebrow="DURABLE EXECUTION"
	title="Automations"
	description="Deterministic schedules and events bounded by dedicated Privy signer policies."
>
	{#snippet action()}<button class="button primary"><Plus size={15} /> New automation</button
		>{/snippet}
</PageHeader>

<section class="metrics three">
	<div class="metric">
		<div class="metric-icon green"><Zap /></div>
		<div><span>Active definitions</span><strong>2</strong><small>44 successful runs</small></div>
	</div>
	<div class="metric">
		<div class="metric-icon blue"><Radio /></div>
		<div><span>Event delivery</span><strong>Healthy</strong><small>Last webhook 4m ago</small></div>
	</div>
	<div class="metric">
		<div class="metric-icon amber"><CalendarClock /></div>
		<div><span>Next run</span><strong>18h 42m</strong><small>Cloud hosting · monthly</small></div>
	</div>
</section>

<section class="panel">
	<header>
		<div>
			<h2>Automation definitions</h2>
			<p>Service principals are separate from interactive team memberships.</p>
		</div>
		<label class="toggle-row compact"
			><input type="checkbox" bind:checked={dryRun} /><span>Dry-run preview</span></label
		>
	</header>
	<div class="automation-list">
		{#each automations as automation}<article>
				<div class="automation-icon">
					{#if automation.trigger.includes('deposit')}<Radio size={19} />{:else}<CalendarClock
							size={19}
						/>{/if}
				</div>
				<div class="automation-name">
					<strong>{automation.name}</strong><small>{automation.id}</small>
				</div>
				<div><span class="cell-label">TRIGGER</span><strong>{automation.trigger}</strong></div>
				<div>
					<span class="cell-label">POLICY BOUNDARY</span><strong>{automation.boundary}</strong>
				</div>
				<div><StatusBadge status={automation.status} /><small>{automation.runs} runs</small></div>
				<button class="icon-button" aria-label="Run now"><Play size={15} /></button>
			</article>{/each}
	</div>
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
		<div class="detail-row"><span>Service principal</span><strong>svc/vendor-payments</strong></div>
		<div class="detail-row">
			<span>Privy authorization key</span><strong>auth_key_01JQ5…72B</strong>
		</div>
		<div class="detail-row"><span>Claim strategy</span><strong>Atomic · at-most-once</strong></div>
	</section>
	<section class="panel">
		<header>
			<div>
				<h2>Reconciliation</h2>
				<p>Five-minute provider consistency loop.</p>
			</div>
			<StatusBadge status="active" />
		</header>
		<div class="detail-row"><span>Pending wallet actions</span><strong>1</strong></div>
		<div class="detail-row"><span>Stale runs</span><strong>0</strong></div>
		<div class="detail-row"><span>Last completed</span><strong>2 minutes ago</strong></div>
	</section>
</div>
