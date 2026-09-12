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

	async initialize() {
		if (!browser || this.ready) return;
		this.loading = true;
		try {
			if (!env.PUBLIC_PRIVY_APP_ID || !env.PUBLIC_PRIVY_CLIENT_ID) {
				throw new Error('Ratib needs configured Privy app and client IDs.');
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
				if (event.source !== this.iframe?.contentWindow) return;
				const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
				this.client?.embeddedWallet.onMessage(data);
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
		if (!this.client) throw new Error('Privy is not initialized.');
		try {
			await this.client.auth.email.sendCode(email);
			this.codeSent = true;
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Unable to send a sign-in code.';
			throw error;
		}
	}

	async loginWithEmail(email: string, code: string) {
		this.loading = true;
		this.error = null;
		try {
			if (!this.client) throw new Error('Privy is not initialized.');
			const result = await this.client!.auth.email.loginWithCode(email, code);
			this.user = toConsoleUser(result.user);
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Unable to sign in.';
			throw error;
		} finally {
			this.loading = false;
		}
	}

	async loginWithGoogle() {
		if (!this.client) throw new Error('Privy is not initialized.');
		const redirect = `${window.location.origin}/auth/callback`;
		const result = await this.client!.auth.oauth.generateURL('google', redirect);
		window.location.assign(result.url);
	}

	async completeOAuthLogin(search: string) {
		if (!this.client) throw new Error('Privy is not initialized.');
		const params = new URLSearchParams(search);
		const code = params.get('privy_oauth_code');
		const state = params.get('privy_oauth_state');
		if (!code || !state) throw new Error('Privy OAuth callback parameters are missing.');
		const result = await this.client.auth.oauth.loginWithCode(code, state, 'google');
		this.user = toConsoleUser(result.user);
		return this.user;
	}

	async getAccessToken() {
		return this.client?.getAccessToken() ?? null;
	}

	async logout() {
		await this.client?.auth.logout({ userId: this.user?.id });
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
