<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { privyAuth } from '$lib/auth/privy.svelte';
	import { organization } from '$lib/mock-data';
	import {
		LayoutDashboard,
		WalletCards,
		Send,
		ShieldCheck,
		CheckSquare,
		Zap,
		Users,
		ScrollText,
		Settings,
		Search,
		Bell,
		ChevronsUpDown,
		LogOut
	} from '@lucide/svelte';

	let { children }: { children: import('svelte').Snippet } = $props();
	let mobileOpen = $state(false);

	const groups = [
		{
			label: 'Workspace',
			items: [
				{ href: '/app', label: 'Overview', icon: LayoutDashboard },
				{ href: '/app/wallets', label: 'Wallets', icon: WalletCards },
				{ href: '/app/payments', label: 'Payments', icon: Send },
				{ href: '/app/approvals', label: 'Approvals', icon: CheckSquare, count: 2 }
			]
		},
		{
			label: 'Controls',
			items: [
				{ href: '/app/policies', label: 'Policies', icon: ShieldCheck },
				{ href: '/app/automations', label: 'Automations', icon: Zap },
				{ href: '/app/team', label: 'Team', icon: Users },
				{ href: '/app/audit', label: 'Audit log', icon: ScrollText }
			]
		},
		{ label: 'System', items: [{ href: '/app/setup', label: 'Setup', icon: Settings }] }
	];

	onMount(async () => {
		await privyAuth.initialize();
	});

	async function signOut() {
		await privyAuth.logout();
		await goto('/');
	}
</script>

<div class="network-banner">
	<span></span>Base Sepolia testnet <b>·</b>
	{privyAuth.isMock ? 'Mock provider' : 'Live provider'}
</div>
<div class="app-frame">
	<aside class:mobile-open={mobileOpen}>
		<div class="brand">
			<div class="brand-mark">N</div>
			<div><strong>NORTHSTAR</strong><small>Treasury operations</small></div>
		</div>
		<button class="org-switch"
			><div class="org-avatar">NL</div>
			<div><strong>{organization.name}</strong><span>Primary workspace</span></div>
			<ChevronsUpDown size={14} /></button
		>
		<nav>
			{#each groups as group}
				<div class="nav-group">
					<small>{group.label}</small>
					{#each group.items as item}
						<a
							href={item.href}
							class:active={page.url.pathname === item.href}
							onclick={() => (mobileOpen = false)}
						>
							<item.icon size={17} /><span>{item.label}</span>{#if item.count}<b>{item.count}</b
								>{/if}
						</a>
					{/each}
				</div>
			{/each}
		</nav>
		<div class="sidebar-foot">
			<div class="avatar">AS</div>
			<div>
				<strong>{privyAuth.user?.name ?? 'Avery Stone'}</strong><span>{organization.role}</span>
			</div>
			<button aria-label="Sign out" onclick={signOut}><LogOut size={16} /></button>
		</div>
	</aside>
	<div class="workspace">
		<header class="topbar">
			<button class="mobile-menu" onclick={() => (mobileOpen = !mobileOpen)}>Menu</button>
			<div class="search">
				<Search size={16} /><input
					aria-label="Search"
					placeholder="Search operations, wallets, people…"
				/><kbd>⌘ K</kbd>
			</div>
			<div class="top-actions">
				<button aria-label="Notifications"><Bell size={18} /><i></i></button><span class="env-pill"
					>LIVE DATA</span
				>
			</div>
		</header>
		<main>{@render children()}</main>
	</div>
</div>
