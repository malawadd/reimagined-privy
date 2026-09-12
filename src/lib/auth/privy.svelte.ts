import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import Privy, { LocalStorage } from '@privy-io/js-sdk-core';

export interface ConsoleUser {
	id: string;
	email: string;
	name: string;
}

class PrivyAuthStore {
	ready = $state(false);
	loading = $state(false);
	user = $state<ConsoleUser | null>(null);
	error = $state<string | null>(null);
	codeSent = $state(false);
	private client: Privy | null = null;
	private iframe: HTMLIFrameElement | null = null;

	get isMock() {
		return (env.PUBLIC_PRIVY_MODE || 'mock') === 'mock';
	}

	async initialize() {
		if (!browser || this.ready) return;
		this.loading = true;
		try {
			if (this.isMock) {
				const saved = localStorage.getItem('privy-starter:mock-user');
				this.user = saved ? JSON.parse(saved) : null;
				return;
			}
			if (!env.PUBLIC_PRIVY_APP_ID || !env.PUBLIC_PRIVY_CLIENT_ID) {
				throw new Error('Privy app and client IDs are required in live mode.');
			}
			this.client = new Privy({
				appId: env.PUBLIC_PRIVY_APP_ID,
				clientId: env.PUBLIC_PRIVY_CLIENT_ID,
				storage: new LocalStorage()
			});
			this.iframe = document.createElement('iframe');
			this.iframe.hidden = true;
			this.iframe.title = 'Privy secure wallet bridge';
			this.iframe.src = this.client.embeddedWallet.getURL();
			document.body.appendChild(this.iframe);
			this.client.setMessagePoster({
				postMessage: (message: unknown, targetOrigin: string, transfer?: Transferable) =>
					this.iframe?.contentWindow?.postMessage(
						message,
						targetOrigin,
						transfer ? [transfer] : []
					),
				reload: () => this.iframe?.contentWindow?.location.reload()
			});
			window.addEventListener('message', (event) => {
				if (event.source === this.iframe?.contentWindow)
					this.client?.embeddedWallet.onMessage(event.data);
			});
			await this.client.initialize();
			try {
				const session = await this.client.user.get();
				this.user = toConsoleUser(session.user);
			} catch {
				this.user = null;
			}
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Unable to initialize Privy.';
		} finally {
			this.loading = false;
			this.ready = true;
		}
	}

	async sendEmailCode(email: string) {
		this.error = null;
		if (this.isMock) {
			this.codeSent = true;
			return;
		}
		await this.client?.auth.email.sendCode(email);
		this.codeSent = true;
	}

	async loginWithEmail(email: string, code: string) {
		this.loading = true;
		this.error = null;
		try {
			if (this.isMock) {
				if (code !== '123456') throw new Error('Use 123456 in mock mode.');
				this.user = {
					id: 'did:privy:mock-operator',
					email,
					name: email.split('@')[0] || 'Operator'
				};
				localStorage.setItem('privy-starter:mock-user', JSON.stringify(this.user));
				return;
			}
			const result = await this.client!.auth.email.loginWithCode(email, code);
			this.user = toConsoleUser(result.user);
		} finally {
			this.loading = false;
		}
	}

	async loginWithGoogle() {
		if (this.isMock) {
			this.user = {
				id: 'did:privy:mock-google',
				email: 'operator@northstar.test',
				name: 'Avery Stone'
			};
			localStorage.setItem('privy-starter:mock-user', JSON.stringify(this.user));
			return;
		}
		const redirect = `${window.location.origin}/auth/callback`;
		const result = await this.client!.auth.oauth.generateURL('google', redirect);
		window.location.assign(result.url);
	}

	async getAccessToken() {
		if (this.isMock) return 'mock-privy-access-token';
		return this.client?.getAccessToken() ?? null;
	}

	async logout() {
		await this.client?.auth.logout({ userId: this.user?.id });
		localStorage.removeItem('privy-starter:mock-user');
		this.user = null;
		this.codeSent = false;
	}
}

function toConsoleUser(value: unknown): ConsoleUser {
	const user = value as {
		id: string;
		linked_accounts?: Array<{ type: string; address?: string }>;
	};
	const emailAccount = user.linked_accounts?.find((account) => account.type === 'email');
	const email =
		typeof emailAccount?.address === 'string' ? emailAccount.address : 'operator@example.com';
	return { id: user.id, email, name: email.split('@')[0] || 'Operator' };
}

export const privyAuth = new PrivyAuthStore();
