<script lang="ts">
	let {
		eyebrow,
		title,
		description,
		action
	}: { eyebrow?: string; title: string; description: string; action?: import('svelte').Snippet } =
		$props();
</script>

<header class="page-header">
	<div>
		{#if eyebrow}<div class="eyebrow">{eyebrow}</div>{/if}
		<h1>{title}</h1>
		<p>{description}</p>
	</div>
	{#if action}<div class="actions">{@render action()}</div>{/if}
</header>
