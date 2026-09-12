<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { privyAuth } from '$lib/auth/privy.svelte';
	import { workspace } from '$lib/workspace.svelte';
	import { api } from '../../convex/_generated/api';
	import { useAuth, useMutation, useQuery } from 'convex-svelte';
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
		LogOut,
		ContactRound,
		FileText,
		ReceiptText,
		Layers3,
		BookOpenCheck,
		ListChecks,
		BarChart3
	} from '@lucide/svelte';

	let { children }: { children: import('svelte').Snippet } = $props();
	let mobileOpen = $state(false);
	let orgMenuOpen = $state(false);
	let syncStarted = false;
	const convexAuth = useAuth();
	const syncCurrentUser = useMutation(api.users.syncCurrent);
	const workspaces = useQuery(api.organizations.listMine, () =>
		convexAuth.isAuthenticated ? {} : 'skip'
	);
	const currentUser = useQuery(api.users.getCurrent, () =>
		convexAuth.isAuthenticated ? {} : 'skip'
	);
	const shellSummary = useQuery(api.dashboard.get, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	let workspaceRows = $derived(workspaces.data ?? []);
	let activeWorkspace = $derived(
		workspaceRows.find((row) => row.organization._id === workspace.activeOrganizationId) ??
			workspaceRows[0]
	);

	const groups = $derived([
		{
			label: 'Workspace',
			items: [
				{ href: '/app', label: 'Overview', icon: LayoutDashboard },
				{ href: '/app/wallets', label: 'Wallets', icon: WalletCards },
				{ href: '/app/payments', label: 'Payments', icon: Send },
				{ href: '/app/transactions', label: 'Transactions', icon: ListChecks },
				{ href: '/app/counterparties', label: 'Counterparties', icon: ContactRound },
				{
					href: '/app/approvals',
					label: 'Approvals',
					icon: CheckSquare,
					count: shellSummary.data?.pendingApprovalCount
				}
			]
		},
		{
			label: 'Finance',
			items: [
				{ href: '/app/invoices', label: 'Invoices', icon: FileText },
				{ href: '/app/payables', label: 'Bills & expenses', icon: ReceiptText },
				{ href: '/app/batches', label: 'Batches & payroll', icon: Layers3 },
				{ href: '/app/reports', label: 'Reports', icon: BarChart3 }
			]
		},
		{
			label: 'Controls',
			items: [
				{ href: '/app/policies', label: 'Policies', icon: ShieldCheck },
				{ href: '/app/automations', label: 'Automations', icon: Zap },
				{ href: '/app/ledger', label: 'Ledger & reconcile', icon: BookOpenCheck },
				{ href: '/app/team', label: 'Team', icon: Users },
				{ href: '/app/audit', label: 'Audit log', icon: ScrollText }
			]
		},
		{ label: 'System', items: [{ href: '/app/setup', label: 'Setup', icon: Settings }] }
	]);

	onMount(async () => {
		await privyAuth.initialize();
		if (!privyAuth.user) await goto('/login');
	});

	$effect(() => {
		if (privyAuth.user && convexAuth.isAuthenticated && !syncStarted) {
			syncStarted = true;
			void syncCurrentUser({
				email: privyAuth.user.email,
				name: privyAuth.user.name
			});
		}
	});

	$effect(() => {
		workspace.reconcile(workspaceRows.map((row) => row.organization._id));
	});

	async function signOut() {
		await privyAuth.logout();
		await goto('/login');
	}

	function initials(value?: string) {
		return (value || 'Ratib user')
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0])
			.join('')
			.toUpperCase();
	}
</script>

<div class="network-banner">
	<span></span>Base Sepolia testnet <b>·</b> Privy live controls
</div>
<div class="app-frame">
	<aside class:mobile-open={mobileOpen}>
		<div class="brand">
			<div class="brand-mark">R</div>
			<div><strong>RATIB</strong><small>Finance OS</small></div>
		</div>
		<div class="org-picker">
			<button
				class="org-switch"
				aria-haspopup="menu"
				aria-expanded={orgMenuOpen}
				onclick={() => (orgMenuOpen = !orgMenuOpen)}
			>
				<div class="org-avatar">{initials(activeWorkspace?.organization.name)}</div>
				<div>
					<strong
						>{activeWorkspace?.organization.name ??
							(workspaces.isLoading ? 'Loading…' : 'No workspace')}</strong
					>
					<span
						>{activeWorkspace
							? `${activeWorkspace.membership.role} workspace`
							: 'Provisioning required'}</span
					>
				</div>
				<ChevronsUpDown size={14} />
			</button>
			{#if orgMenuOpen && workspaceRows.length > 0}
				<div class="org-menu" role="menu">
					{#each workspaceRows as row}
						<button
							class:active={row.organization._id === workspace.activeOrganizationId}
							role="menuitem"
							onclick={() => {
								workspace.select(row.organization._id);
								orgMenuOpen = false;
							}}
						>
							<span>{initials(row.organization.name)}</span>
							<div>
								<strong>{row.organization.name}</strong><small>{row.membership.role}</small>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>
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
			<div class="avatar">{initials(currentUser.data?.name ?? privyAuth.user?.name)}</div>
			<div>
				<strong>{currentUser.data?.name ?? privyAuth.user?.name ?? 'Signed-in user'}</strong><span
					>{activeWorkspace?.membership.role ?? 'No active role'}</span
				>
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
