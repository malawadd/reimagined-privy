<script lang="ts">
	let { status }: { status: string } = $props();
	const tone = $derived(
		status === 'succeeded' || status === 'active' || status === 'ready'
			? 'success'
			: status === 'pendingApproval' || status === 'pendingConfirmation' || status === 'review'
				? 'warning'
				: status === 'failed' || status === 'rejected'
					? 'danger'
					: 'neutral'
	);
	const label = $derived(status.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()));
</script>

<span class="status {tone}"><i></i>{label}</span>

<style>
	.status {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		border-radius: 999px;
		padding: 0.3rem 0.58rem;
		font-size: 0.72rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.status i {
		width: 0.38rem;
		height: 0.38rem;
		border-radius: 999px;
		background: currentColor;
	}
	.success {
		color: #067a55;
		background: #e7f7f1;
	}
	.warning {
		color: #996000;
		background: #fff3d6;
	}
	.danger {
		color: #b33a46;
		background: #fdebed;
	}
	.neutral {
		color: #52606e;
		background: #edf0f3;
	}
</style>
