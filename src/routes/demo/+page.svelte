<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ArrowDown,
		ArrowRight,
		BookOpen,
		Check,
		CircleDot,
		ExternalLink,
		FileCheck2,
		Fingerprint,
		KeyRound,
		Layers3,
		LockKeyhole,
		Network,
		RefreshCcw,
		Route,
		ShieldCheck,
		Sparkles,
		WalletCards,
		X
	} from '@lucide/svelte';

	const chapters = [
		{
			short: 'Opening',
			time: '00:00–00:15',
			note: 'Digital assets have become programmable and global. But the finance team around them still has to jump between a wallet, a spreadsheet, an approval channel, and an accounting system. Ratib begins with that operational gap.'
		},
		{
			short: 'Problem',
			time: '00:15–00:35',
			note: 'A payout is not just a signature. Someone requests it, someone decides whether it should happen, a wallet executes it, and finance needs evidence afterward. Today those moments often live in three disconnected systems.'
		},
		{
			short: 'Market',
			time: '00:35–01:00',
			note: 'We mapped 27 products, then evidence-graded Ratib against 20 platforms using 41 canonical comparison records. The market is sophisticated, but its depth clusters around separate product categories.'
		},
		{
			short: 'Gap',
			time: '01:00–01:20',
			note: 'The opportunity is not to reproduce every custody network, payment rail, and accounting engine. It is to connect authority to the finance workflow around each transaction: request, review, execution, reconciliation, and evidence.'
		},
		{
			short: 'Why Privy',
			time: '01:20–01:50',
			note: 'Privy was the best architectural fit for Ratib because it gave us the primitives needed to build this operating layer without pretending our application database was a signing authority. Identity, wallets, quorum, policy, native approval, reliable actions, and signed events remain connected.'
		},
		{
			short: 'Architecture',
			time: '01:50–02:15',
			note: 'Ratib controls who can prepare and inspect work. It calculates an explainable policy preview. Privy still authorizes, holds, or denies execution. Base Sepolia settles, and Convex records the reconciled operational evidence.'
		},
		{
			short: 'Product',
			time: '02:15–02:35',
			note: 'That architecture is already visible in the product. Organization-scoped wallets, exact-value payment operations, embedded human approvals, deterministic provider runs, reconciliation, and append-only audit evidence share one workspace.'
		},
		{
			short: 'Future',
			time: '02:35–02:55',
			note: 'The research gave us a disciplined sequence. First finish the paths already inside Ratib. Then deepen policy, checkout, simulation, and recovery. Later expand the platform and integrations. Regulated rails stay partner infrastructure.'
		},
		{
			short: 'Close',
			time: '02:55–03:00',
			note: 'Ratib turns wallet authority into finance operations. Privy makes that possible without collapsing product roles, signing rights, and provider policy into one unsafe permission model.'
		}
	] as const;

	const marketGroups = [
		{
			index: '01',
			title: 'Finance operations',
			companies: ['Request Finance', 'Copperx', 'Mural Pay', 'Loop']
		},
		{
			index: '02',
			title: 'Treasury & custody',
			companies: ['Safe', 'Utila', 'Tholos', 'Fireblocks', 'Fordefi', 'BitGo']
		},
		{
			index: '03',
			title: 'Accounting & reporting',
			companies: ['Bitwave', 'Cryptio', 'TRES Finance']
		},
		{
			index: '04',
			title: 'Programmable infrastructure',
			companies: [
				'Coinbase Prime',
				'Cobo',
				'Circle',
				'Bridge + Stripe',
				'Rain',
				'Modern Treasury',
				'Dfns'
			]
		}
	] as const;

	const privyPrimitives = [
		{
			icon: Fingerprint,
			title: 'Verified identity',
			copy: 'Browser authentication tied to the human actor.'
		},
		{
			icon: WalletCards,
			title: 'Server wallets',
			copy: 'Embedded execution without exposing key material.'
		},
		{
			icon: KeyRound,
			title: 'Signer quorum',
			copy: 'Owners, additional signers, and m-of-n authority.'
		},
		{
			icon: ShieldCheck,
			title: 'Enforced policy',
			copy: 'Chain, amount, recipient, contract, and method controls.'
		},
		{
			icon: LockKeyhole,
			title: 'Native intents',
			copy: 'MFA-backed approvals for privileged wallet changes.'
		},
		{
			icon: RefreshCcw,
			title: 'Reliable lifecycle',
			copy: 'Idempotent actions and signed webhook events.'
		}
	] as const;

	const architecture = [
		{ number: '01', label: 'Operator', detail: 'Authenticated human request' },
		{ number: '02', label: 'Ratib', detail: 'Scope, workflow, policy preview' },
		{ number: '03', label: 'Privy', detail: 'Final signing and policy authority', accent: true },
		{ number: '04', label: 'Base Sepolia', detail: 'Testnet settlement' },
		{ number: '05', label: 'Convex', detail: 'Reconciled operational evidence' }
	] as const;

	const roadmap = [
		{
			label: 'Now',
			title: 'Finish the operating loop',
			copy: 'Authority provisioning · batch operations · search · notifications · automated journeys'
		},
		{
			label: 'Next',
			title: 'Deepen every decision',
			copy: 'Invoice checkout · policy lifecycle · transaction simulation · recovery and gas'
		},
		{
			label: 'Later',
			title: 'Open the platform',
			copy: 'Public API · service identities · multi-network connectors · forecasting'
		},
		{
			label: 'Partner',
			title: 'Connect regulated rails',
			copy: 'Fiat accounts · global payouts · corporate cards · qualified custody'
		}
	] as const;

	let activeIndex = $state(0);
	let notesOpen = $state(false);
	let sectionElements: HTMLElement[] = [];

	function goTo(index: number) {
		const boundedIndex = Math.max(0, Math.min(chapters.length - 1, index));
		const section =
			sectionElements[boundedIndex] ??
			document.querySelector<HTMLElement>(`[data-slide="${boundedIndex}"]`);
		activeIndex = boundedIndex;
		section?.scrollIntoView({
			behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
			block: 'start'
		});
	}

	function handleKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		const isInteractive = Boolean(target?.closest('a, button, input, textarea, select'));

		if (event.key.toLowerCase() === 'n' && !isInteractive) {
			event.preventDefault();
			notesOpen = !notesOpen;
			return;
		}

		if (isInteractive) return;

		if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(event.key)) {
			event.preventDefault();
			goTo(activeIndex + 1);
		}
		if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(event.key)) {
			event.preventDefault();
			goTo(activeIndex - 1);
		}
		if (event.key === 'Home') {
			event.preventDefault();
			goTo(0);
		}
		if (event.key === 'End') {
			event.preventDefault();
			goTo(chapters.length - 1);
		}
	}

	onMount(() => {
		document.documentElement.classList.add('demo-mode');
		document.body.classList.add('demo-mode');
		sectionElements = Array.from(document.querySelectorAll<HTMLElement>('[data-slide]'));

		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((entry) => entry.isIntersecting)
					.sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
				if (!visible) return;
				activeIndex = Number((visible.target as HTMLElement).dataset.slide ?? 0);
			},
			{ threshold: [0.45, 0.6, 0.75] }
		);

		sectionElements.forEach((section) => observer.observe(section));

		return () => {
			observer.disconnect();
			document.documentElement.classList.remove('demo-mode');
			document.body.classList.remove('demo-mode');
		};
	});
</script>

<svelte:head>
	<title>Ratib | Three-minute product story</title>
	<meta
		name="description"
		content="A three-minute visual story about Ratib, the digital asset operations market, and why Privy is its authority layer."
	/>
	<link rel="preload" as="image" href="/landing/hero-city.webp" />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<header class="deck-header">
	<a class="brand" href="/" aria-label="Ratib home"><span>R</span><strong>RATIB</strong></a>
	<p><i></i> LIVE ON BASE SEPOLIA <b>·</b> PRIVY-CONTROLLED</p>
	<button
		class="notes-toggle"
		type="button"
		onclick={() => (notesOpen = !notesOpen)}
		aria-pressed={notesOpen}
	>
		<BookOpen size={15} /> Notes <kbd>N</kbd>
	</button>
</header>

<nav class="chapter-rail" aria-label="Presentation chapters">
	<p><strong>{String(activeIndex + 1).padStart(2, '0')}</strong> / 09</p>
	<div class="rail-line" aria-hidden="true">
		<span style={`height: ${((activeIndex + 1) / chapters.length) * 100}%`}></span>
	</div>
	<div class="chapter-buttons">
		{#each chapters as chapter, index}
			<button
				type="button"
				class:active={activeIndex === index}
				onclick={() => goTo(index)}
				aria-label={`Go to chapter ${index + 1}: ${chapter.short}`}
				aria-current={activeIndex === index ? 'step' : undefined}
			>
				<span></span><b>{chapter.short}</b>
			</button>
		{/each}
	</div>
	<small>{chapters[activeIndex].time}</small>
</nav>

<aside
	class="presenter-notes"
	class:open={notesOpen}
	aria-label="Presenter notes"
	aria-hidden={!notesOpen}
	inert={!notesOpen}
>
	<header>
		<div>
			<span>PRESENTER NOTES</span>
			<strong>{chapters[activeIndex].time}</strong>
		</div>
		<button type="button" onclick={() => (notesOpen = false)} aria-label="Close presenter notes"
			><X size={18} /></button
		>
	</header>
	<div class="note-body">
		<p class="note-index">0{activeIndex + 1} / {chapters[activeIndex].short}</p>
		<p>{chapters[activeIndex].note}</p>
		<div class="source-list">
			<strong>Research basis</strong>
			<a
				href="https://docs.privy.io/security/wallet-infrastructure/policy-and-controls"
				target="_blank"
				rel="noreferrer"
			>
				Privy policy and controls <ExternalLink size={12} />
			</a>
			<a
				href="https://docs.privy.io/transaction-management/overview"
				target="_blank"
				rel="noreferrer"
			>
				Privy transaction management <ExternalLink size={12} />
			</a>
			<a
				href="https://docs.moderntreasury.com/payments/docs/overview"
				target="_blank"
				rel="noreferrer"
			>
				Modern Treasury payment orders <ExternalLink size={12} />
			</a>
			<a href="https://cryptio.co/solutions/reconciliation" target="_blank" rel="noreferrer">
				Cryptio reconciliation <ExternalLink size={12} />
			</a>
		</div>
	</div>
</aside>

<main class="demo-deck" aria-label="Ratib three-minute product presentation">
	<section
		id="opening"
		class="slide opening"
		class:active-slide={activeIndex === 0}
		data-slide="0"
		aria-labelledby="opening-title"
	>
		<img
			class="opening-world"
			src="/landing/hero-city.webp"
			alt=""
			width="1730"
			height="909"
			fetchpriority="high"
		/>
		<div class="opening-wash" aria-hidden="true"></div>
		<img
			class="opening-flora left"
			src="/landing/flora-left.webp"
			alt=""
			width="920"
			height="965"
			aria-hidden="true"
		/>
		<img
			class="opening-flora right"
			src="/landing/flora-right.webp"
			alt=""
			width="920"
			height="965"
			aria-hidden="true"
		/>
		<div class="opening-copy reveal">
			<p class="kicker"><Sparkles size={14} /> THREE MINUTES · ONE OPERATING LAYER</p>
			<h1 id="opening-title">Digital assets moved.<br /><em>Finance operations didn’t.</em></h1>
			<p class="lede">The case for a governed finance layer around every wallet transaction.</p>
		</div>
		<div class="opening-ticket reveal delay-2">
			<span>RATIB / PRODUCT STORY</span>
			<strong>SCROLL TO BEGIN</strong>
			<ArrowDown size={17} />
		</div>
	</section>

	<section
		id="problem"
		class="slide problem-slide"
		class:active-slide={activeIndex === 1}
		data-slide="1"
		aria-labelledby="problem-title"
	>
		<div class="slide-number" aria-hidden="true">01</div>
		<div class="problem-copy reveal">
			<p class="kicker">THE OPERATING PROBLEM</p>
			<h2 id="problem-title">One transaction.<br /><em>Three disconnected systems.</em></h2>
			<p>A signature is only one moment in a much longer finance workflow.</p>
		</div>
		<div class="system-route" aria-label="Disconnected transaction workflow">
			<article class="system-card wallet reveal delay-1">
				<div><WalletCards size={22} /><span>01</span></div>
				<small>EXECUTION</small>
				<h3>Wallet</h3>
				<p>Holds assets and signs the transaction.</p>
			</article>
			<div class="broken-line one" aria-hidden="true"><i></i><b>?</b><i></i></div>
			<article class="system-card workflow reveal delay-2">
				<div><Layers3 size={22} /><span>02</span></div>
				<small>DECISION</small>
				<h3>Finance workflow</h3>
				<p>Requests, reviews, approves, and explains.</p>
			</article>
			<div class="broken-line two" aria-hidden="true"><i></i><b>?</b><i></i></div>
			<article class="system-card evidence reveal delay-3">
				<div><FileCheck2 size={22} /><span>03</span></div>
				<small>RECORD</small>
				<h3>Accounting evidence</h3>
				<p>Reconciles what actually happened.</p>
			</article>
		</div>
		<p class="problem-foot reveal delay-3">
			<CircleDot size={13} /> Context gets lost between every handoff.
		</p>
	</section>

	<section
		id="market"
		class="slide market-slide"
		class:active-slide={activeIndex === 2}
		data-slide="2"
		aria-labelledby="market-title"
	>
		<img
			class="market-world"
			src="/demo/market-fragments.webp"
			alt=""
			width="1672"
			height="941"
			loading="lazy"
			aria-hidden="true"
		/>
		<div class="market-overlay" aria-hidden="true"></div>
		<div class="market-intro reveal">
			<div>
				<p class="kicker light">TWO STUDIES · ONE MARKET MAP</p>
				<h2 id="market-title">
					The market is sophisticated.<br /><em>And structurally fragmented.</em>
				</h2>
			</div>
			<div class="research-stats" aria-label="Market research totals">
				<p><strong>27</strong><span>products mapped</span></p>
				<p><strong>20</strong><span>platforms compared</span></p>
				<p><strong>41</strong><span>evidence records</span></p>
			</div>
		</div>
		<div class="market-groups">
			{#each marketGroups as group, index}
				<article class="market-group reveal" style={`--delay: ${0.1 + index * 0.08}s`}>
					<div>
						<span>{group.index}</span>
						<h3>{group.title}</h3>
					</div>
					<p>{group.companies.join(' · ')}</p>
				</article>
			{/each}
		</div>
		<p class="method-note">
			Evidence-graded by workflow—not customer counts, market claims, or a composite winner.
		</p>
	</section>

	<section
		id="gap"
		class="slide gap-slide"
		class:active-slide={activeIndex === 3}
		data-slide="3"
		aria-labelledby="gap-title"
	>
		<div class="gap-copy reveal">
			<p class="kicker">THE OPPORTUNITY</p>
			<h2 id="gap-title">The market has depth—<br /><em>in pieces.</em></h2>
			<p>
				Ratib is the organization-scoped layer that makes the entire transaction legible to finance.
			</p>
		</div>
		<div class="gap-map" aria-label="Ratib connects the finance operating loop">
			<div class="gap-orbit" aria-hidden="true"></div>
			<div class="gap-center reveal delay-2">
				<span>THE MISSING LAYER</span><strong>RATIB</strong><small
					>Governed finance operations</small
				>
			</div>
			{#each ['Request', 'Review', 'Execute', 'Reconcile', 'Evidence'] as item, index}
				<div class={`gap-node node-${index + 1} reveal`} style={`--delay: ${0.18 + index * 0.07}s`}>
					<span>0{index + 1}</span><strong>{item}</strong>
				</div>
			{/each}
		</div>
		<div class="gap-thesis reveal delay-3">
			<span>NOT ANOTHER WALLET</span>
			<p>One control plane around <em>every transaction.</em></p>
		</div>
	</section>

	<section
		id="privy"
		class="slide privy-slide"
		class:active-slide={activeIndex === 4}
		data-slide="4"
		aria-labelledby="privy-title"
	>
		<div class="privy-heading reveal">
			<div>
				<p class="kicker light">WHY PRIVY</p>
				<h2 id="privy-title">The authority primitives<br /><em>Ratib actually needed.</em></h2>
			</div>
			<p>
				Not a universal winner. The best architectural fit for a finance product that must never
				confuse application access with signing authority.
			</p>
		</div>
		<div class="primitive-grid">
			{#each privyPrimitives as primitive, index}
				{@const Icon = primitive.icon}
				<article class="primitive reveal" style={`--delay: ${0.1 + index * 0.06}s`}>
					<div><Icon size={20} /><span>0{index + 1}</span></div>
					<h3>{primitive.title}</h3>
					<p>{primitive.copy}</p>
				</article>
			{/each}
		</div>
		<div class="privy-answer reveal delay-3">
			<ShieldCheck size={24} />
			<p>Privy gave Ratib an <strong>authority layer</strong>, not merely a wallet SDK.</p>
		</div>
	</section>

	<section
		id="architecture"
		class="slide architecture-slide"
		class:active-slide={activeIndex === 5}
		data-slide="5"
		aria-labelledby="architecture-title"
	>
		<div class="architecture-heading reveal">
			<p class="kicker">BUILT AROUND AUTHORITY</p>
			<h2 id="architecture-title">Ratib coordinates.<br /><em>Privy authorizes.</em></h2>
			<p>
				Application roles determine who can prepare and inspect work. Privy determines whether
				execution is allowed.
			</p>
		</div>
		<div class="bridge-stage">
			<img
				src="/demo/authority-bridge.webp"
				alt=""
				width="1800"
				height="600"
				loading="lazy"
				aria-hidden="true"
			/>
			<div class="architecture-flow" aria-label="Ratib transaction authority flow">
				{#each architecture as step, index}
					<article
						class:accent={'accent' in step && step.accent}
						class="reveal"
						style={`--delay: ${0.12 + index * 0.08}s`}
					>
						<span>{step.number}</span><strong>{step.label}</strong><small>{step.detail}</small>
					</article>
				{/each}
			</div>
		</div>
		<p class="authority-warning reveal delay-3">
			<LockKeyhole size={14} /> Ratib roles never grant signing authority.
		</p>
	</section>

	<section
		id="product"
		class="slide product-slide"
		class:active-slide={activeIndex === 6}
		data-slide="6"
		aria-labelledby="product-title"
	>
		<img
			class="product-orbit"
			src="/demo/operations-orbit.webp"
			alt=""
			width="1672"
			height="941"
			loading="lazy"
			aria-hidden="true"
		/>
		<div class="product-copy reveal">
			<p class="kicker">THE PRODUCT TODAY</p>
			<h2 id="product-title">Authority becomes<br /><em>an operating system.</em></h2>
			<p>
				Every state, human decision, provider action, and settlement result stays in one governed
				context.
			</p>
			<div class="proof-list">
				{#each ['Org-scoped wallets', 'Deterministic payments', 'Embedded approvals', 'Policy automation', 'Reconciliation', 'Append-only evidence'] as proof}
					<span><Check size={13} /> {proof}</span>
				{/each}
			</div>
		</div>
		<div class="workspace-preview reveal delay-2" aria-label="Illustrative Ratib workspace preview">
			<aside>
				<div class="mini-brand"><span>R</span><b>RATIB</b></div>
				<p class="selected"><Layers3 size={13} /> Operations</p>
				<p><WalletCards size={13} /> Wallets</p>
				<p><Route size={13} /> Payments</p>
				<p><ShieldCheck size={13} /> Approvals</p>
				<p><FileCheck2 size={13} /> Reconciliation</p>
			</aside>
			<div class="workspace-main">
				<header>
					<div><small>FINANCE OPERATIONS</small><strong>Live workspace</strong></div>
					<span><i></i> PRIVY FINAL AUTHORITY</span>
				</header>
				<div class="workspace-status">
					<p><span>Network</span><strong>Base Sepolia</strong><small>Testnet</small></p>
					<p>
						<span>Approval authority</span><strong>Privy quorum</strong><small
							>Provider enforced</small
						>
					</p>
					<p><span>Automation</span><strong>Policy-bound</strong><small>Fail closed</small></p>
				</div>
				<div class="operation-list">
					<header><strong>Recent operations</strong><span>Illustrative states</span></header>
					<p>
						<i class="coral"></i><span
							><b>Vendor payment</b><small>Policy preview complete</small></span
						><em>Pending approval</em>
					</p>
					<p>
						<i class="lime"></i><span
							><b>Invoice collection</b><small>Provider event reconciled</small></span
						><em class="success">Reconciled</em>
					</p>
					<p>
						<i class="blue"></i><span
							><b>Payroll run</b><small>Deterministic execution key</small></span
						><em class="process">Processing</em>
					</p>
				</div>
				<footer><LockKeyhole size={12} /> Product preview · no customer balances shown</footer>
			</div>
		</div>
	</section>

	<section
		id="future"
		class="slide future-slide"
		class:active-slide={activeIndex === 7}
		data-slide="7"
		aria-labelledby="future-title"
	>
		<img
			class="future-world"
			src="/demo/future-horizon.webp"
			alt=""
			width="1672"
			height="941"
			loading="lazy"
			aria-hidden="true"
		/>
		<div class="future-wash" aria-hidden="true"></div>
		<div class="future-heading reveal">
			<p class="kicker light">A RESEARCH-LED ROADMAP</p>
			<h2 id="future-title">Finish the loop.<br /><em>Then expand the network.</em></h2>
		</div>
		<div class="roadmap" aria-label="Ratib product roadmap">
			<div class="road-line" aria-hidden="true"><span></span></div>
			{#each roadmap as phase, index}
				<article class="reveal" style={`--delay: ${0.1 + index * 0.1}s`}>
					<div><span>0{index + 1}</span><b>{phase.label}</b></div>
					<h3>{phase.title}</h3>
					<p>{phase.copy}</p>
				</article>
			{/each}
		</div>
		<p class="future-rule reveal delay-3">
			<Network size={14} /> Regulated money movement remains partner infrastructure.
		</p>
	</section>

	<section
		id="close"
		class="slide close-slide"
		class:active-slide={activeIndex === 8}
		data-slide="8"
		aria-labelledby="close-title"
	>
		<img
			class="close-world"
			src="/landing/hero-city.webp"
			alt=""
			width="1730"
			height="909"
			loading="lazy"
			aria-hidden="true"
		/>
		<div class="close-shade" aria-hidden="true"></div>
		<img
			class="close-flora"
			src="/landing/flora-right.webp"
			alt=""
			width="920"
			height="965"
			loading="lazy"
			aria-hidden="true"
		/>
		<div class="close-orbits" aria-hidden="true"><i></i><i></i><i></i></div>
		<div class="close-copy reveal">
			<p class="kicker light">RATIB FINANCE OS</p>
			<h2 id="close-title">Ratib turns wallet authority<br /><em>into finance operations.</em></h2>
			<p>One governed workspace. Privy-controlled. Base Sepolia today.</p>
			<div class="close-actions">
				<a href="/login">Enter Ratib <ArrowRight size={16} /></a>
				<button type="button" onclick={() => goTo(0)}><RefreshCcw size={15} /> Restart story</button
				>
			</div>
		</div>
		<footer>
			<span>RATIB / 2026</span>
			<p>Finance operations for businesses moving digital assets.</p>
			<span>09 / 09</span>
		</footer>
	</section>
</main>

<style>
	:global(html.demo-mode) {
		scroll-behavior: smooth;
		scroll-snap-type: y mandatory;
		scrollbar-width: none;
	}
	:global(html.demo-mode::-webkit-scrollbar) {
		display: none;
	}
	:global(body.demo-mode) {
		overflow-x: hidden;
		color: #073f43;
		background: #f5efe4;
	}
	:global(body.demo-mode button:focus-visible),
	:global(body.demo-mode a:focus-visible) {
		outline: 3px solid #c9f528;
		outline-offset: 4px;
	}
	:global(body.demo-mode h1),
	:global(body.demo-mode h2),
	:global(body.demo-mode h3),
	:global(body.demo-mode p) {
		margin: 0;
	}
	.demo-deck {
		--ink: #073f43;
		--deep: #042f35;
		--paper: #fffaf0;
		--cream: #f5efe4;
		--lime: #c9f528;
		--lavender: #ad9cf4;
		--coral: #ef7467;
		--sky: #72b7ec;
		--green: #2f7b67;
	}
	.slide {
		position: relative;
		display: grid;
		width: 100%;
		height: 100svh;
		min-height: 720px;
		overflow: hidden;
		scroll-snap-align: start;
		scroll-snap-stop: always;
		isolation: isolate;
	}
	.slide h1,
	.slide h2 {
		font-family: Georgia, Cambria, 'Times New Roman', serif;
		font-weight: 500;
		letter-spacing: -0.055em;
	}
	.slide h1 em,
	.slide h2 em {
		font-weight: 500;
	}
	.kicker {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #287a69;
		font-size: clamp(0.58rem, 0.65vw, 0.72rem);
		font-weight: 900;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}
	.kicker.light {
		color: #b7ead8;
	}
	.deck-header {
		position: fixed;
		z-index: 100;
		top: 20px;
		left: 28px;
		right: 28px;
		display: grid;
		height: 48px;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		border: 1px solid rgba(255, 255, 255, 0.58);
		border-radius: 10px;
		padding: 0 12px 0 15px;
		color: #173f42;
		background: rgba(255, 253, 248, 0.88);
		box-shadow: 0 13px 30px rgba(4, 47, 53, 0.09);
		backdrop-filter: blur(18px);
	}
	.brand {
		display: flex;
		width: fit-content;
		align-items: center;
		gap: 9px;
	}
	.brand span,
	.mini-brand span {
		display: grid;
		place-items: center;
		border-radius: 50%;
		color: white;
		background: #073f43;
		font-family: Georgia, serif;
	}
	.brand span {
		width: 28px;
		height: 28px;
		font-size: 0.7rem;
	}
	.brand strong {
		font-size: 0.65rem;
		letter-spacing: 0.18em;
	}
	.deck-header > p {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 0.58rem;
		font-weight: 900;
		letter-spacing: 0.11em;
	}
	.deck-header > p i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #38aa82;
		box-shadow: 0 0 0 4px rgba(56, 170, 130, 0.14);
	}
	.deck-header > p b {
		color: #97aaa6;
	}
	.notes-toggle {
		display: flex;
		width: fit-content;
		height: 32px;
		align-items: center;
		justify-self: end;
		gap: 7px;
		border: 1px solid #cad8d3;
		border-radius: 7px;
		padding: 0 9px;
		color: #173f42;
		background: white;
		font-size: 0.62rem;
		font-weight: 800;
	}
	.notes-toggle kbd {
		border: 1px solid #d9e0dd;
		border-radius: 4px;
		padding: 1px 4px;
		color: #6e817d;
		background: #f5f7f5;
		font-size: 0.52rem;
	}
	.chapter-rail {
		position: fixed;
		z-index: 90;
		top: 50%;
		right: 27px;
		display: grid;
		width: 118px;
		grid-template-columns: auto 2px auto;
		align-items: center;
		gap: 12px;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 10px;
		padding: 39px 10px 33px 12px;
		color: white;
		background: rgba(4, 47, 53, 0.72);
		filter: drop-shadow(0 2px 9px rgba(4, 47, 53, 0.38));
		transform: translateY(-50%);
		backdrop-filter: blur(12px);
	}
	.chapter-rail > p,
	.chapter-rail > small {
		position: absolute;
		right: 0;
		width: 100px;
		font-size: 0.54rem;
		font-weight: 850;
		letter-spacing: 0.1em;
		text-align: right;
	}
	.chapter-rail > p {
		top: 9px;
	}
	.chapter-rail > p strong {
		font-size: 0.75rem;
	}
	.chapter-rail > small {
		bottom: 11px;
	}
	.rail-line {
		position: relative;
		width: 2px;
		height: 196px;
		grid-column: 2;
		grid-row: 1;
		border-radius: 9px;
		background: rgba(255, 255, 255, 0.36);
	}
	.rail-line span {
		display: block;
		width: 100%;
		border-radius: inherit;
		background: var(--lime, #c9f528);
		transition: height 0.35s ease;
	}
	.chapter-buttons {
		display: grid;
		grid-column: 3;
		grid-row: 1;
		gap: 6px;
	}
	.chapter-buttons button {
		display: flex;
		height: 16px;
		align-items: center;
		justify-content: flex-end;
		gap: 7px;
		border: 0;
		padding: 0;
		color: white;
		background: transparent;
	}
	.chapter-buttons button span {
		order: 2;
		width: 6px;
		height: 6px;
		border: 1px solid rgba(255, 255, 255, 0.7);
		border-radius: 50%;
		background: rgba(5, 55, 58, 0.25);
		transition: all 0.2s ease;
	}
	.chapter-buttons button b {
		opacity: 0;
		font-size: 0.52rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		transform: translateX(6px);
		transition: all 0.2s ease;
	}
	.chapter-buttons button:hover b,
	.chapter-buttons button:focus-visible b,
	.chapter-buttons button.active b {
		opacity: 1;
		transform: translateX(0);
	}
	.chapter-buttons button.active span {
		border-color: var(--lime, #c9f528);
		background: var(--lime, #c9f528);
		box-shadow: 0 0 0 4px rgba(201, 245, 40, 0.18);
	}
	.presenter-notes {
		position: fixed;
		z-index: 130;
		top: 80px;
		right: 28px;
		width: min(390px, calc(100vw - 56px));
		max-height: calc(100vh - 110px);
		overflow: auto;
		border: 1px solid #335f5d;
		border-radius: 12px;
		color: white;
		background: rgba(4, 47, 53, 0.96);
		box-shadow: 0 24px 70px rgba(0, 0, 0, 0.3);
		opacity: 0;
		pointer-events: none;
		transform: translateX(30px);
		transition: all 0.25s ease;
		backdrop-filter: blur(18px);
	}
	.presenter-notes.open {
		opacity: 1;
		pointer-events: auto;
		transform: translateX(0);
	}
	.presenter-notes header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid rgba(255, 255, 255, 0.13);
		padding: 16px 18px;
	}
	.presenter-notes header span,
	.presenter-notes header strong {
		display: block;
	}
	.presenter-notes header span {
		color: #a3c8bf;
		font-size: 0.54rem;
		font-weight: 900;
		letter-spacing: 0.14em;
	}
	.presenter-notes header strong {
		margin-top: 4px;
		font-size: 0.72rem;
	}
	.presenter-notes button {
		border: 0;
		padding: 5px;
		color: white;
		background: transparent;
	}
	.note-body {
		padding: 20px;
	}
	.note-index {
		margin-bottom: 13px !important;
		color: var(--lime, #c9f528);
		font-size: 0.58rem;
		font-weight: 900;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	.note-body > p:not(.note-index) {
		color: #d7e5e1;
		font-family: Georgia, serif;
		font-size: 1.08rem;
		line-height: 1.55;
	}
	.source-list {
		display: grid;
		gap: 8px;
		margin-top: 22px;
		border-top: 1px solid rgba(255, 255, 255, 0.12);
		padding-top: 16px;
	}
	.source-list > strong {
		margin-bottom: 3px;
		color: #91b9b1;
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.source-list a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-radius: 5px;
		padding: 7px 8px;
		color: #e6f0ed;
		background: rgba(255, 255, 255, 0.05);
		font-size: 0.65rem;
	}
	.reveal {
		opacity: 0;
		transform: translateY(24px);
		transition:
			opacity 0.65s ease var(--delay, 0s),
			transform 0.65s cubic-bezier(0.2, 0.8, 0.2, 1) var(--delay, 0s);
	}
	.slide.active-slide .reveal {
		opacity: 1;
		transform: translateY(0);
	}
	.delay-1 {
		--delay: 0.08s;
	}
	.delay-2 {
		--delay: 0.18s;
	}
	.delay-3 {
		--delay: 0.3s;
	}
	.opening {
		place-items: center;
		padding: 104px 9vw 65px;
		color: var(--ink);
		background: #f8efe5;
	}
	.opening-world,
	.market-world,
	.future-world,
	.close-world {
		position: absolute;
		z-index: -3;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.opening-world {
		object-position: center 52%;
	}
	.opening-wash {
		position: absolute;
		z-index: -2;
		inset: 0;
		background: linear-gradient(
			90deg,
			rgba(255, 249, 239, 0.96) 0%,
			rgba(255, 249, 239, 0.82) 38%,
			rgba(255, 249, 239, 0.08) 74%
		);
	}
	.opening-copy {
		width: 100%;
		max-width: 1500px;
	}
	.opening-copy h1 {
		max-width: 1050px;
		margin-top: 24px;
		font-size: clamp(5rem, 7.2vw, 8.5rem);
		line-height: 0.86;
	}
	.opening-copy h1 em {
		color: #4779e8;
	}
	.opening-copy .lede {
		max-width: 620px;
		margin-top: 27px;
		color: #4f6c69;
		font-size: clamp(0.88rem, 1vw, 1.08rem);
		line-height: 1.65;
	}
	.opening-flora {
		position: absolute;
		z-index: -1;
		width: min(37vw, 650px);
		height: auto;
		pointer-events: none;
	}
	.opening-flora.left {
		left: -230px;
		bottom: -380px;
	}
	.opening-flora.right {
		right: -190px;
		bottom: -300px;
	}
	.opening-ticket {
		position: absolute;
		right: 8vw;
		bottom: 64px;
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 6px 35px;
		border: 1px solid rgba(7, 63, 67, 0.35);
		border-radius: 8px;
		padding: 13px 15px;
		background: rgba(255, 253, 248, 0.84);
		backdrop-filter: blur(8px);
	}
	.opening-ticket span {
		grid-column: 1 / 3;
		color: #6d827d;
		font-size: 0.5rem;
		letter-spacing: 0.12em;
	}
	.opening-ticket strong {
		font-size: 0.61rem;
		letter-spacing: 0.1em;
	}
	.problem-slide {
		grid-template-columns: 0.74fr 1.26fr;
		align-items: center;
		gap: 6vw;
		padding: 115px 9vw 70px;
		background:
			radial-gradient(circle at 88% 18%, rgba(173, 156, 244, 0.38), transparent 27%),
			linear-gradient(120deg, #fff9ef 0%, #f1eadf 100%);
	}
	.slide-number {
		position: absolute;
		right: 5vw;
		bottom: -10vh;
		color: rgba(7, 63, 67, 0.055);
		font-family: Georgia, serif;
		font-size: 46vh;
		line-height: 1;
	}
	.problem-copy {
		position: relative;
		z-index: 2;
	}
	.problem-copy h2,
	.gap-copy h2,
	.privy-heading h2,
	.architecture-heading h2,
	.product-copy h2,
	.future-heading h2 {
		margin-top: 17px;
		font-size: clamp(3.8rem, 5.4vw, 6.5rem);
		line-height: 0.91;
	}
	.problem-copy h2 em {
		color: var(--coral);
	}
	.problem-copy > p:last-child {
		max-width: 500px;
		margin-top: 24px;
		color: #667b76;
		line-height: 1.65;
	}
	.system-route {
		position: relative;
		display: grid;
		grid-template-columns: 1fr 64px 1fr;
		grid-template-rows: 1fr 72px 1fr;
		align-items: center;
		gap: 0 18px;
	}
	.system-card {
		position: relative;
		min-height: 190px;
		border: 1px solid rgba(7, 63, 67, 0.2);
		border-radius: 12px;
		padding: 24px;
		background: rgba(255, 253, 248, 0.88);
		box-shadow: 0 22px 55px rgba(7, 63, 67, 0.1);
		backdrop-filter: blur(10px);
	}
	.system-card.wallet {
		grid-column: 1;
		grid-row: 1;
		transform: rotate(-2deg);
	}
	.system-card.workflow {
		grid-column: 3;
		grid-row: 1 / 4;
		align-self: center;
		transform: rotate(1.5deg);
	}
	.system-card.evidence {
		grid-column: 1;
		grid-row: 3;
		transform: rotate(1deg);
	}
	.system-card > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		color: var(--green);
	}
	.system-card > div span {
		color: #91a39f;
		font-size: 0.56rem;
		font-weight: 900;
	}
	.system-card small {
		display: block;
		margin-top: 24px;
		color: #7b908b;
		font-size: 0.52rem;
		font-weight: 900;
		letter-spacing: 0.13em;
	}
	.system-card h3 {
		margin-top: 7px;
		font-family: Georgia, serif;
		font-size: 1.75rem;
		font-weight: 500;
	}
	.system-card p {
		margin-top: 8px;
		color: #6c7d79;
		font-size: 0.72rem;
		line-height: 1.55;
	}
	.broken-line {
		display: flex;
		align-items: center;
		gap: 7px;
		color: var(--coral);
	}
	.broken-line.one {
		grid-column: 2;
		grid-row: 1;
	}
	.broken-line.two {
		grid-column: 2;
		grid-row: 3;
	}
	.broken-line i {
		width: 18px;
		border-top: 1px dashed #ef7467;
	}
	.broken-line b {
		font-family: Georgia, serif;
		font-size: 1.15rem;
	}
	.problem-foot {
		position: absolute;
		left: 9vw;
		bottom: 48px;
		display: flex;
		align-items: center;
		gap: 8px;
		color: #8b5b54;
		font-size: 0.64rem;
		font-weight: 800;
	}
	.market-slide {
		align-content: space-between;
		padding: 118px 9vw 58px;
		color: white;
		background: var(--deep);
	}
	.market-world {
		opacity: 0.58;
		filter: saturate(1.08);
	}
	.market-overlay {
		position: absolute;
		z-index: -2;
		inset: 0;
		background: linear-gradient(
			180deg,
			rgba(4, 47, 53, 0.92) 0%,
			rgba(4, 47, 53, 0.47) 50%,
			rgba(4, 47, 53, 0.96) 100%
		);
	}
	.market-intro {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: end;
		gap: 60px;
	}
	.market-intro h2 {
		margin-top: 14px;
		font-size: clamp(3.5rem, 4.8vw, 5.8rem);
		line-height: 0.92;
	}
	.market-intro h2 em {
		color: var(--lime);
	}
	.research-stats {
		display: flex;
		gap: 10px;
	}
	.research-stats p {
		display: grid;
		width: 125px;
		min-height: 98px;
		align-content: center;
		border: 1px solid rgba(255, 255, 255, 0.28);
		border-radius: 8px;
		padding: 12px;
		background: rgba(4, 47, 53, 0.56);
		backdrop-filter: blur(10px);
	}
	.research-stats strong {
		font-family: Georgia, serif;
		font-size: 2rem;
		font-weight: 500;
	}
	.research-stats span {
		margin-top: 2px;
		color: #bcd1cc;
		font-size: 0.55rem;
		line-height: 1.35;
	}
	.market-groups {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 12px;
		margin-top: auto;
	}
	.market-group {
		min-height: 150px;
		border: 1px solid rgba(255, 255, 255, 0.28);
		border-radius: 9px;
		padding: 18px;
		background: rgba(4, 47, 53, 0.75);
		box-shadow: 0 16px 35px rgba(0, 0, 0, 0.14);
		backdrop-filter: blur(12px);
	}
	.market-group > div {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.market-group > div span {
		display: grid;
		width: 28px;
		height: 28px;
		place-items: center;
		border-radius: 50%;
		color: var(--ink);
		background: var(--lime);
		font-size: 0.55rem;
		font-weight: 900;
	}
	.market-group h3 {
		font-family: Georgia, serif;
		font-size: 1.1rem;
		font-weight: 500;
	}
	.market-group p {
		margin-top: 19px;
		color: #c5d8d3;
		font-size: 0.63rem;
		line-height: 1.65;
	}
	.method-note {
		margin-top: 15px !important;
		color: #9db9b3;
		font-size: 0.56rem;
		letter-spacing: 0.04em;
	}
	.gap-slide {
		grid-template-columns: 0.68fr 1.32fr;
		align-items: center;
		gap: 5vw;
		padding: 110px 9vw 70px;
		background:
			linear-gradient(90deg, transparent 49.85%, rgba(7, 63, 67, 0.12) 50%, transparent 50.15%),
			linear-gradient(#f3efdc 0%, #edf1d5 100%);
	}
	.gap-copy h2 em {
		color: var(--coral);
	}
	.gap-copy > p:last-child {
		max-width: 500px;
		margin-top: 24px;
		color: #657a75;
		line-height: 1.7;
	}
	.gap-map {
		position: relative;
		width: min(740px, 100%);
		aspect-ratio: 1.32;
		justify-self: end;
	}
	.gap-orbit {
		position: absolute;
		inset: 8%;
		border: 1px solid rgba(7, 63, 67, 0.24);
		border-radius: 50%;
		box-shadow:
			0 0 0 46px rgba(255, 255, 255, 0.25),
			0 0 0 92px rgba(255, 255, 255, 0.16);
	}
	.gap-orbit::before,
	.gap-orbit::after {
		content: '';
		position: absolute;
		border-radius: 50%;
	}
	.gap-orbit::before {
		inset: -7px;
		border: 2px dashed rgba(71, 121, 232, 0.38);
		animation: orbit 28s linear infinite;
	}
	.gap-orbit::after {
		top: 50%;
		left: 50%;
		width: 58%;
		border-top: 2px solid var(--lime);
		transform: translate(-50%, -50%) rotate(-20deg);
	}
	.gap-center {
		position: absolute;
		z-index: 2;
		top: 50%;
		left: 50%;
		display: grid;
		width: 220px;
		height: 220px;
		place-content: center;
		border-radius: 50%;
		color: white;
		text-align: center;
		background: var(--ink);
		box-shadow: 0 24px 60px rgba(7, 63, 67, 0.24);
		transform: translate(-50%, -50%);
	}
	.gap-center span {
		color: #a8cac2;
		font-size: 0.5rem;
		font-weight: 900;
		letter-spacing: 0.12em;
	}
	.gap-center strong {
		margin-top: 8px;
		font-family: Georgia, serif;
		font-size: 3rem;
		font-weight: 500;
	}
	.gap-center small {
		margin-top: 4px;
		color: #c3d7d2;
		font-size: 0.6rem;
	}
	.gap-node {
		position: absolute;
		z-index: 3;
		min-width: 118px;
		border: 1px solid rgba(7, 63, 67, 0.2);
		border-radius: 999px;
		padding: 10px 15px;
		background: rgba(255, 253, 248, 0.92);
		box-shadow: 0 12px 25px rgba(7, 63, 67, 0.1);
		backdrop-filter: blur(8px);
	}
	.gap-node span {
		margin-right: 7px;
		color: #4a7b72;
		font-size: 0.5rem;
	}
	.gap-node strong {
		font-size: 0.68rem;
	}
	.node-1 {
		top: 1%;
		left: 39%;
	}
	.node-2 {
		top: 26%;
		right: 0;
	}
	.node-3 {
		right: 9%;
		bottom: 5%;
	}
	.node-4 {
		bottom: 3%;
		left: 16%;
	}
	.node-5 {
		top: 29%;
		left: -2%;
	}
	.gap-thesis {
		position: absolute;
		left: 9vw;
		bottom: 48px;
		display: flex;
		align-items: center;
		gap: 18px;
	}
	.gap-thesis span {
		border-radius: 99px;
		padding: 7px 10px;
		color: white;
		background: var(--ink);
		font-size: 0.52rem;
		font-weight: 900;
		letter-spacing: 0.1em;
	}
	.gap-thesis p {
		font-family: Georgia, serif;
		font-size: 1rem;
	}
	.gap-thesis p em {
		color: #4779e8;
	}
	.privy-slide {
		align-content: center;
		gap: 34px;
		padding: 105px 9vw 65px;
		color: white;
		background:
			radial-gradient(circle at 90% 18%, rgba(71, 121, 232, 0.25), transparent 26%),
			radial-gradient(circle at 10% 90%, rgba(47, 123, 103, 0.72), transparent 31%), var(--deep);
	}
	.privy-heading {
		display: grid;
		grid-template-columns: 1.2fr 0.8fr;
		align-items: end;
		gap: 70px;
	}
	.privy-heading h2 em {
		color: var(--lime);
	}
	.privy-heading > p {
		max-width: 520px;
		padding-bottom: 7px;
		color: #bad0cb;
		line-height: 1.65;
	}
	.primitive-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 11px;
	}
	.primitive {
		min-height: 145px;
		border: 1px solid rgba(182, 224, 210, 0.25);
		border-radius: 9px;
		padding: 18px;
		background: rgba(255, 255, 255, 0.045);
	}
	.primitive > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		color: #9fe1c8;
	}
	.primitive > div span {
		color: #779b94;
		font-size: 0.52rem;
		font-weight: 900;
	}
	.primitive h3 {
		margin-top: 20px;
		font-family: Georgia, serif;
		font-size: 1.15rem;
		font-weight: 500;
	}
	.primitive p {
		margin-top: 6px;
		color: #a9c0bb;
		font-size: 0.65rem;
		line-height: 1.5;
	}
	.privy-answer {
		display: flex;
		align-items: center;
		gap: 14px;
		border-left: 3px solid var(--lime);
		padding: 13px 16px;
		color: #d5e7e3;
		background: rgba(255, 255, 255, 0.06);
	}
	.privy-answer :global(svg) {
		color: var(--lime);
	}
	.privy-answer p {
		font-family: Georgia, serif;
		font-size: clamp(1.05rem, 1.4vw, 1.4rem);
	}
	.privy-answer strong {
		color: var(--lime);
		font-weight: 500;
	}
	.architecture-slide {
		grid-template-columns: 0.7fr 1.3fr;
		align-items: center;
		gap: 4vw;
		padding: 100px 7vw 55px 9vw;
		background: linear-gradient(135deg, #fff9ed 0%, #eee8f7 100%);
	}
	.architecture-heading h2 em {
		color: #4779e8;
	}
	.architecture-heading > p:last-child {
		max-width: 510px;
		margin-top: 23px;
		color: #607772;
		line-height: 1.65;
	}
	.bridge-stage {
		position: relative;
		min-height: 590px;
		align-self: center;
	}
	.bridge-stage > img {
		position: absolute;
		z-index: -1;
		left: 50%;
		bottom: 2%;
		width: 115%;
		height: auto;
		filter: drop-shadow(0 25px 28px rgba(7, 63, 67, 0.14));
		transform: translateX(-50%);
	}
	.architecture-flow {
		display: grid;
		min-height: 540px;
		grid-template-columns: repeat(5, 1fr);
		align-items: end;
		gap: 8px;
		padding: 0 2%;
	}
	.architecture-flow article {
		position: relative;
		display: grid;
		min-height: 130px;
		align-content: start;
		border: 1px solid rgba(7, 63, 67, 0.22);
		border-radius: 8px;
		padding: 13px;
		background: rgba(255, 253, 248, 0.9);
		box-shadow: 0 15px 34px rgba(7, 63, 67, 0.11);
		backdrop-filter: blur(10px);
	}
	.architecture-flow article:nth-child(1) {
		margin-bottom: 70px;
	}
	.architecture-flow article:nth-child(2) {
		margin-bottom: 120px;
	}
	.architecture-flow article:nth-child(3) {
		margin-bottom: 155px;
	}
	.architecture-flow article:nth-child(4) {
		margin-bottom: 105px;
	}
	.architecture-flow article:nth-child(5) {
		margin-bottom: 55px;
	}
	.architecture-flow article.accent {
		border-color: var(--lime);
		color: white;
		background: rgba(7, 77, 71, 0.95);
	}
	.architecture-flow article span {
		color: #76918b;
		font-size: 0.5rem;
		font-weight: 900;
	}
	.architecture-flow article.accent span {
		color: var(--lime);
	}
	.architecture-flow article strong {
		margin-top: 24px;
		font-family: Georgia, serif;
		font-size: 1.05rem;
		font-weight: 500;
	}
	.architecture-flow article small {
		margin-top: 6px;
		color: #697e79;
		font-size: 0.56rem;
		line-height: 1.45;
	}
	.architecture-flow article.accent small {
		color: #b9d3cd;
	}
	.authority-warning {
		position: absolute;
		left: 9vw;
		bottom: 47px;
		display: flex;
		align-items: center;
		gap: 8px;
		border-left: 3px solid var(--coral);
		padding: 8px 11px;
		color: #6e504c;
		background: rgba(255, 255, 255, 0.55);
		font-size: 0.62rem;
		font-weight: 800;
	}
	.product-slide {
		grid-template-columns: 0.62fr 1.38fr;
		align-items: center;
		gap: 5vw;
		padding: 105px 8vw 60px 9vw;
		background: linear-gradient(135deg, #eef2dc 0%, #fbf6ea 100%);
	}
	.product-orbit {
		position: absolute;
		z-index: -1;
		inset: 3% 1% auto auto;
		width: 74%;
		height: auto;
		opacity: 0.73;
		pointer-events: none;
	}
	.product-copy {
		position: relative;
		z-index: 2;
	}
	.product-copy h2 em {
		color: var(--coral);
	}
	.product-copy > p:not(.kicker) {
		max-width: 520px;
		margin-top: 23px;
		color: #607671;
		line-height: 1.65;
	}
	.proof-list {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
		margin-top: 26px;
	}
	.proof-list span {
		display: flex;
		align-items: center;
		gap: 6px;
		border: 1px solid #c8d5ce;
		border-radius: 999px;
		padding: 7px 9px;
		color: #446963;
		background: rgba(255, 253, 248, 0.82);
		font-size: 0.57rem;
		font-weight: 800;
	}
	.proof-list :global(svg) {
		color: #2e9475;
	}
	.workspace-preview {
		position: relative;
		z-index: 2;
		display: grid;
		width: min(820px, 100%);
		min-height: 500px;
		grid-template-columns: 150px 1fr;
		justify-self: end;
		overflow: hidden;
		border: 8px solid rgba(255, 255, 255, 0.8);
		border-radius: 14px;
		background: #f8faf8;
		box-shadow: 0 35px 80px rgba(7, 63, 67, 0.22);
		transform: rotate(0.7deg);
	}
	.workspace-preview > aside {
		padding: 18px 12px;
		color: #b5d1cb;
		background: #073f43;
	}
	.mini-brand {
		display: flex;
		align-items: center;
		gap: 7px;
		margin: 3px 5px 35px;
	}
	.mini-brand span {
		width: 24px;
		height: 24px;
		color: var(--ink);
		background: var(--lime);
		font-size: 0.6rem;
	}
	.mini-brand b {
		color: white;
		font-size: 0.56rem;
		letter-spacing: 0.14em;
	}
	.workspace-preview > aside p {
		display: flex;
		height: 35px;
		align-items: center;
		gap: 8px;
		margin-bottom: 3px !important;
		border-radius: 6px;
		padding: 0 8px;
		font-size: 0.55rem;
	}
	.workspace-preview > aside p.selected {
		color: white;
		background: #176158;
	}
	.workspace-main {
		min-width: 0;
		padding: 20px;
	}
	.workspace-main > header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 22px;
	}
	.workspace-main > header small,
	.workspace-main > header strong {
		display: block;
	}
	.workspace-main > header small {
		color: #91a09c;
		font-size: 0.48rem;
		letter-spacing: 0.1em;
	}
	.workspace-main > header strong {
		margin-top: 5px;
		font-family: Georgia, serif;
		font-size: 1.4rem;
		font-weight: 500;
	}
	.workspace-main > header > span {
		display: flex;
		align-items: center;
		gap: 6px;
		color: #408373;
		font-size: 0.46rem;
		font-weight: 900;
		letter-spacing: 0.08em;
	}
	.workspace-main > header > span i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #5bc79c;
	}
	.workspace-status {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border: 1px solid #dae4df;
		border-radius: 8px;
		background: white;
	}
	.workspace-status p {
		display: grid;
		gap: 4px;
		border-right: 1px solid #e2e9e5;
		padding: 14px;
	}
	.workspace-status p:last-child {
		border: 0;
	}
	.workspace-status span {
		color: #879792;
		font-size: 0.48rem;
	}
	.workspace-status strong {
		font-size: 0.63rem;
	}
	.workspace-status small {
		color: #6b837d;
		font-size: 0.48rem;
	}
	.operation-list {
		margin-top: 14px;
		border: 1px solid #dae4df;
		border-radius: 8px;
		background: white;
	}
	.operation-list header {
		display: flex;
		justify-content: space-between;
		border-bottom: 1px solid #e6ece9;
		padding: 11px 13px;
		font-size: 0.55rem;
	}
	.operation-list header span {
		color: #8d9c98;
	}
	.operation-list > p {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 9px;
		border-bottom: 1px solid #edf1ef;
		padding: 13px;
	}
	.operation-list > p:last-child {
		border: 0;
	}
	.operation-list > p > i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.operation-list i.coral {
		background: var(--coral);
	}
	.operation-list i.lime {
		background: #49a87f;
	}
	.operation-list i.blue {
		background: #4779e8;
	}
	.operation-list b,
	.operation-list small {
		display: block;
	}
	.operation-list b {
		font-size: 0.56rem;
	}
	.operation-list small {
		margin-top: 3px;
		color: #8a9995;
		font-size: 0.47rem;
	}
	.operation-list em {
		border-radius: 99px;
		padding: 5px 7px;
		color: #9a6310;
		background: #fff1cc;
		font-size: 0.45rem;
		font-style: normal;
		font-weight: 800;
	}
	.operation-list em.success {
		color: #1b7556;
		background: #e6f5ed;
	}
	.operation-list em.process {
		color: #356a9d;
		background: #e7eff9;
	}
	.workspace-main > footer {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 13px;
		color: #83928e;
		font-size: 0.48rem;
	}
	.future-slide {
		align-content: space-between;
		padding: 110px 9vw 60px;
		color: white;
		background: var(--deep);
	}
	.future-world {
		opacity: 0.72;
	}
	.future-wash {
		position: absolute;
		z-index: -2;
		inset: 0;
		background: linear-gradient(
			180deg,
			rgba(4, 47, 53, 0.91) 0%,
			rgba(4, 47, 53, 0.35) 52%,
			rgba(4, 47, 53, 0.96) 100%
		);
	}
	.future-heading h2 em {
		color: var(--lime);
	}
	.roadmap {
		position: relative;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 12px;
		margin-top: auto;
	}
	.road-line {
		position: absolute;
		top: -20px;
		left: 4%;
		right: 4%;
		height: 2px;
		background: rgba(255, 255, 255, 0.3);
	}
	.road-line span {
		display: block;
		width: 75%;
		height: 100%;
		background: var(--lime);
	}
	.roadmap article {
		min-height: 185px;
		border: 1px solid rgba(255, 255, 255, 0.28);
		border-radius: 9px;
		padding: 18px;
		background: rgba(4, 47, 53, 0.76);
		backdrop-filter: blur(12px);
	}
	.roadmap article > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.roadmap article > div span {
		display: grid;
		width: 28px;
		height: 28px;
		place-items: center;
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 50%;
		font-size: 0.52rem;
	}
	.roadmap article > div b {
		color: var(--lime);
		font-size: 0.55rem;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}
	.roadmap h3 {
		margin-top: 34px;
		font-family: Georgia, serif;
		font-size: 1.28rem;
		font-weight: 500;
	}
	.roadmap p {
		margin-top: 9px;
		color: #bad0ca;
		font-size: 0.61rem;
		line-height: 1.55;
	}
	.future-rule {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-top: 15px !important;
		color: #b6cdc7;
		font-size: 0.56rem;
		font-weight: 800;
	}
	.problem-slide,
	.market-slide,
	.gap-slide,
	.privy-slide,
	.architecture-slide,
	.product-slide,
	.future-slide {
		padding-right: max(10vw, 155px);
	}
	.close-slide {
		place-items: center;
		padding: 110px 9vw 80px;
		color: white;
		text-align: center;
		background: var(--deep);
	}
	.close-world {
		opacity: 0.56;
	}
	.close-shade {
		position: absolute;
		z-index: -2;
		inset: 0;
		background: radial-gradient(circle at center, rgba(6, 69, 70, 0.58), rgba(3, 40, 46, 0.96) 74%);
	}
	.close-flora {
		position: absolute;
		right: -180px;
		bottom: -390px;
		width: min(43vw, 700px);
		height: auto;
		opacity: 0.86;
	}
	.close-orbits {
		position: absolute;
		z-index: -1;
		inset: 0;
		display: grid;
		place-items: center;
	}
	.close-orbits i {
		position: absolute;
		width: 48vw;
		aspect-ratio: 1;
		border: 1px solid rgba(255, 255, 255, 0.13);
		border-radius: 50%;
	}
	.close-orbits i:nth-child(2) {
		width: 37vw;
	}
	.close-orbits i:nth-child(3) {
		width: 26vw;
		border-color: rgba(201, 245, 40, 0.2);
	}
	.close-copy {
		position: relative;
		z-index: 2;
	}
	.close-copy .kicker {
		justify-content: center;
	}
	.close-copy h2 {
		margin-top: 18px;
		font-size: clamp(4.2rem, 6vw, 7.2rem);
		line-height: 0.9;
	}
	.close-copy h2 em {
		color: var(--lime);
	}
	.close-copy > p:not(.kicker) {
		margin-top: 23px;
		color: #bfd1cd;
	}
	.close-actions {
		display: flex;
		justify-content: center;
		gap: 9px;
		margin-top: 30px;
	}
	.close-actions a,
	.close-actions button {
		display: flex;
		height: 46px;
		align-items: center;
		gap: 8px;
		border-radius: 7px;
		padding: 0 16px;
		font-size: 0.68rem;
		font-weight: 850;
	}
	.close-actions a {
		color: var(--ink);
		background: white;
	}
	.close-actions button {
		border: 1px solid rgba(255, 255, 255, 0.45);
		color: white;
		background: rgba(255, 255, 255, 0.06);
	}
	.close-slide > footer {
		position: absolute;
		right: 5vw;
		bottom: 28px;
		left: 5vw;
		display: flex;
		justify-content: space-between;
		color: #8fafaa;
		font-size: 0.52rem;
		letter-spacing: 0.08em;
	}
	@keyframes orbit {
		to {
			transform: rotate(360deg);
		}
	}
	@media (max-width: 1400px) {
		.deck-header {
			left: 20px;
			right: 20px;
		}
		.chapter-rail {
			right: 19px;
		}
		.slide {
			min-height: 680px;
		}
		.opening,
		.problem-slide,
		.market-slide,
		.gap-slide,
		.privy-slide,
		.product-slide,
		.future-slide {
			padding-left: 6vw;
			padding-right: 145px;
		}
		.architecture-slide {
			padding-left: 6vw;
			padding-right: 145px;
		}
		.workspace-preview {
			min-height: 460px;
			grid-template-columns: 130px 1fr;
		}
		.market-group {
			min-height: 140px;
			padding: 15px;
		}
		.roadmap article {
			min-height: 170px;
		}
	}
	@media (max-height: 800px) {
		.slide {
			min-height: 650px;
		}
		.deck-header {
			top: 12px;
			height: 43px;
		}
		.opening,
		.problem-slide,
		.market-slide,
		.gap-slide,
		.privy-slide,
		.architecture-slide,
		.product-slide,
		.future-slide,
		.close-slide {
			padding-top: 78px;
			padding-bottom: 43px;
		}
		.problem-copy h2,
		.gap-copy h2,
		.privy-heading h2,
		.architecture-heading h2,
		.product-copy h2,
		.future-heading h2 {
			font-size: clamp(3rem, 4.6vw, 5rem);
		}
		.opening-copy h1 {
			font-size: clamp(4.4rem, 6.7vw, 7rem);
		}
		.primitive-grid {
			gap: 8px;
		}
		.primitive {
			min-height: 120px;
			padding: 14px;
		}
		.primitive h3 {
			margin-top: 13px;
		}
		.bridge-stage {
			min-height: 500px;
		}
		.architecture-flow {
			min-height: 470px;
		}
		.workspace-preview {
			min-height: 410px;
			transform: scale(0.94) rotate(0.7deg);
			transform-origin: right center;
		}
		.roadmap article {
			min-height: 145px;
		}
		.roadmap h3 {
			margin-top: 22px;
		}
		.opening-ticket,
		.problem-foot,
		.gap-thesis,
		.authority-warning {
			bottom: 28px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(html.demo-mode) {
			scroll-behavior: auto;
		}
		.reveal {
			opacity: 1;
			transform: none;
			transition: none;
		}
		.gap-orbit::before {
			animation: none;
		}
		.rail-line span,
		.chapter-buttons button span,
		.chapter-buttons button b,
		.presenter-notes {
			transition: none;
		}
	}
</style>
