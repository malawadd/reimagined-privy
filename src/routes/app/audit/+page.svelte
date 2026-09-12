<script lang="ts">
	import { Download, Search, ShieldCheck } from '@lucide/svelte';
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const events = useQuery(api.audit.listRecent, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	let query = $state('');
	let category = $state<'all' | 'payment' | 'control' | 'automation'>('all');
	let filtered = $derived(
		(events.data ?? []).filter((event) => {
			const matchesText =
				`${event.actorId} ${event.action} ${event.resourceType} ${event.resourceId} ${event.correlationId} ${event.privyIds.join(' ')}`
					.toLowerCase()
					.includes(query.toLowerCase());
			const matchesCategory =
				category === 'all' ||
				(category === 'payment'
					? event.action.includes('payment')
					: category === 'automation'
						? event.action.includes('automation')
						: /policy|wallet|recipient|member|intent/.test(event.action));
			return matchesText && matchesCategory;
		})
	);

	function csv(value: unknown) {
		return `"${String(value ?? '').replaceAll('"', '""')}"`;
	}

	function exportCsv() {
		const header = [
			'Timestamp',
			'Actor type',
			'Actor',
			'Action',
			'Resource type',
			'Resource ID',
			'Correlation ID',
			'Privy IDs',
			'Transaction hash'
		];
		const rows = filtered.map((event) => [
			new Date(event.occurredAt).toISOString(),
			event.actorType,
			event.actorId,
			event.action,
			event.resourceType,
			event.resourceId,
			event.correlationId,
			event.privyIds.join(' '),
			event.transactionHash ?? ''
		]);
		const blob = new Blob([[header, ...rows].map((row) => row.map(csv).join(',')).join('\r\n')], {
			type: 'text/csv;charset=utf-8'
		});
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `ratib-audit-${new Date().toISOString().slice(0, 10)}.csv`;
		anchor.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head><title>Audit log | Ratib</title></svelte:head>

<PageHeader
	eyebrow="EVIDENCE"
	title="Audit log"
	description="Append-only organization evidence with provider, intent, and transaction correlation."
>
	{#snippet action()}<button
			class="button secondary"
			disabled={!filtered.length}
			onclick={exportCsv}><Download size={15} /> Export CSV</button
		>{/snippet}
</PageHeader>

<section class="panel audit-panel">
	<header>
		<div class="search audit-search">
			<Search size={16} /><input
				bind:value={query}
				aria-label="Search audit events"
				placeholder="Search actor, action, ID, or correlation…"
			/>
		</div>
		<div class="filter-pills" aria-label="Audit category">
			<button class:active={category === 'all'} onclick={() => (category = 'all')}
				>All events</button
			><button class:active={category === 'payment'} onclick={() => (category = 'payment')}
				>Payments</button
			><button class:active={category === 'control'} onclick={() => (category = 'control')}
				>Controls</button
			><button class:active={category === 'automation'} onclick={() => (category = 'automation')}
				>Automation</button
			>
		</div>
	</header>
	{#if events.isLoading}<div class="audit-empty">Loading append-only evidence…</div>
	{:else if events.error}<div class="audit-empty error" role="alert">{events.error.message}</div>
	{:else if filtered.length === 0}<div class="audit-empty">
			{query || category !== 'all'
				? 'No events match the current filters.'
				: 'No audit evidence has been recorded for this organization.'}
		</div>
	{:else}<div class="table-wrap">
			<table>
				<thead
					><tr
						><th>Timestamp</th><th>Actor</th><th>Action</th><th>Resource / Privy ID</th><th
							>Correlation ID</th
						></tr
					></thead
				><tbody
					>{#each filtered as event}<tr
							><td class="mono small">{new Date(event.occurredAt).toLocaleString()}</td><td
								><strong>{event.actorType}</strong><small>{event.actorId}</small></td
							><td><strong>{event.action}</strong></td><td class="mono small"
								>{event.resourceType}:{event.resourceId}{#if event.privyIds.length}<small
										>{event.privyIds.join(', ')}</small
									>{/if}</td
							><td class="mono small">{event.correlationId}</td></tr
						>{/each}</tbody
				>
			</table>
		</div>{/if}
	<footer>
		<span><ShieldCheck size={15} /> Sensitive keys and tokens are redacted before insertion.</span
		><span>Showing {filtered.length} of {events.data?.length ?? 0} recent events</span>
	</footer>
</section>

<style>
	.audit-empty {
		display: grid;
		min-height: 240px;
		place-items: center;
		color: #738188;
		font-size: 0.74rem;
	}
	.audit-empty.error {
		color: #9b4039;
	}
	td small {
		display: block;
		margin-top: 3px;
		color: #849198;
		font-size: 0.58rem;
	}
</style>
