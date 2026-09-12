<script lang="ts">
	import { Download, Search, ShieldCheck } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { auditEvents } from '$lib/mock-data';
	let query = $state('');
	const filtered = $derived(
		auditEvents.filter((event) =>
			Object.values(event).join(' ').toLowerCase().includes(query.toLowerCase())
		)
	);
</script>

<PageHeader
	eyebrow="EVIDENCE"
	title="Audit log"
	description="Append-only operational evidence with provider and transaction correlation."
>
	{#snippet action()}<button class="button secondary"><Download size={15} /> Export CSV</button
		>{/snippet}
</PageHeader>
<section class="panel audit-panel">
	<header>
		<div class="search audit-search">
			<Search size={16} /><input
				bind:value={query}
				placeholder="Search actor, action, ID, or correlation…"
			/>
		</div>
		<div class="filter-pills">
			<button class="active">All events</button><button>Payments</button><button>Controls</button
			><button>Automation</button>
		</div>
	</header>
	<div class="table-wrap">
		<table>
			<thead
				><tr
					><th>Timestamp</th><th>Actor</th><th>Action</th><th>Resource / Privy ID</th><th
						>Correlation ID</th
					></tr
				></thead
			><tbody
				>{#each filtered as event}<tr
						><td class="mono small">{event.time}</td><td>{event.actor}</td><td
							><strong>{event.action}</strong></td
						><td class="mono small">{event.resource}</td><td class="mono small"
							>{event.correlation}</td
						></tr
					>{/each}</tbody
			>
		</table>
	</div>
	<footer>
		<span><ShieldCheck size={15} /> Sensitive keys and tokens are redacted before insertion.</span
		><span>Showing {filtered.length} events</span>
	</footer>
</section>
