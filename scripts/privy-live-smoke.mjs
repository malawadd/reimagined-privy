import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrivyClient } from '@privy-io/node';

const writeEnabled = process.env.PRIVY_LIVE_SMOKE_WRITE === 'true';
await hydrateLocalCredentials(writeEnabled);
const appId = required('PRIVY_APP_ID');
const appSecret = required('PRIVY_APP_SECRET');
const client = new PrivyClient({
	appId,
	appSecret,
	requestExpiry: { defaultMs: 15 * 60 * 1000, defaultIntentMs: 71 * 60 * 60 * 1000 }
});
const statePath = resolve('.local/privy-live-smoke.json');

const wallets = await collect(client.wallets().list());
const intents = await collect(client.intents().list());
const result = {
	authenticated: true,
	writeEnabled,
	walletCount: wallets.length,
	intentCount: intents.length
};

if (!writeEnabled) {
	console.log(JSON.stringify(result, null, 2));
	process.exit(0);
}

const privateKey = required('PRIVY_AUTHORIZATION_PRIVATE_KEY');
const publicKey = required('PRIVY_AUTHORIZATION_PUBLIC_KEY');
assertKeyPair(privateKey, publicKey);

await mkdir(resolve('.local'), { recursive: true });
const state = await readState();

if (!state.keyQuorumId) {
	const quorum = await client.keyQuorums().create({
		display_name: 'Privy starter local smoke owner',
		authorization_threshold: 1,
		public_keys: [publicKey]
	});
	state.keyQuorumId = quorum.id;
	await saveState(state);
}

if (!state.policyId) {
	const policy = await client.policies().create({
		version: '1.0',
		chain_type: 'ethereum',
		name: 'Privy starter smoke deny-all',
		owner_id: state.keyQuorumId,
		rules: [{ name: 'Deny every action', method: '*', conditions: [], action: 'DENY' }],
		idempotency_key: 'privy-starter-smoke-policy-v1'
	});
	state.policyId = policy.id;
	await saveState(state);
}

if (!state.walletId) {
	const wallet = await client.wallets().create({
		chain_type: 'ethereum',
		display_name: 'Privy starter smoke treasury',
		external_id: 'privy-starter-smoke-treasury-v1',
		owner_id: state.keyQuorumId,
		policy_ids: [state.policyId],
		idempotency_key: 'privy-starter-smoke-wallet-v1'
	});
	state.walletId = wallet.id;
	state.walletAddress = wallet.address;
	await saveState(state);
}

const replayedWallet = await client.wallets().create({
	chain_type: 'ethereum',
	display_name: 'Privy starter smoke treasury',
	external_id: 'privy-starter-smoke-treasury-v1',
	owner_id: state.keyQuorumId,
	policy_ids: [state.policyId],
	idempotency_key: 'privy-starter-smoke-wallet-v1'
});
if (replayedWallet.id !== state.walletId) throw new Error('Privy wallet idempotency check failed.');

const [policy, wallet] = await Promise.all([
	client.policies().get(state.policyId),
	client.wallets().get(state.walletId)
]);

if (!state.walletUpdateIntentId) {
	const intent = await client.intents().updateWallet(state.walletId, {
		display_name: 'Privy starter smoke treasury — intent verified'
	});
	state.walletUpdateIntentId = intent.intent_id;
	await saveState(state);
}

if (!state.policyUpdateIntentId) {
	const intent = await client.intents().updatePolicy(state.policyId, {
		name: 'Privy starter smoke deny-all — intent verified'
	});
	state.policyUpdateIntentId = intent.intent_id;
	await saveState(state);
}

const [walletIntent, policyIntent] = await Promise.all([
	client.intents().get(state.walletUpdateIntentId),
	client.intents().get(state.policyUpdateIntentId)
]);

console.log(
	JSON.stringify(
		{
			...result,
			keyPairVerified: true,
			keyQuorum: summarizeId(state.keyQuorumId),
			policy: {
				id: summarizeId(policy.id),
				ownerMatches: policy.owner_id === state.keyQuorumId,
				denyAll: policy.rules.some((rule) => rule.method === '*' && rule.action === 'DENY')
			},
			wallet: {
				id: summarizeId(wallet.id),
				address: `${wallet.address.slice(0, 8)}…${wallet.address.slice(-4)}`,
				ownerMatches: wallet.owner_id === state.keyQuorumId,
				policyAttached: wallet.policy_ids.includes(state.policyId),
				idempotencyVerified: replayedWallet.id === wallet.id
			},
			intents: [walletIntent, policyIntent].map((intent) => ({
				id: summarizeId(intent.intent_id),
				type: intent.intent_type,
				status: intent.status,
				threshold: intent.authorization_details[0]?.threshold ?? 0
			})),
			stateFile: statePath
		},
		null,
		2
	)
);

function required(name) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required.`);
	return value;
}

async function hydrateLocalCredentials(includeAuthorizationKey) {
	const names = ['PRIVY_APP_ID', 'PRIVY_APP_SECRET'];
	if (includeAuthorizationKey) names.push('PRIVY_AUTHORIZATION_PRIVATE_KEY');

	const convexCli = resolve('node_modules/convex/bin/main.js');
	for (const name of names) {
		if (process.env[name]) continue;
		const lookup = spawnSync(
			process.execPath,
			[convexCli, 'env', 'get', name, '--deployment', 'local'],
			{
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe']
			}
		);
		if (lookup.status === 0 && lookup.stdout.trim()) process.env[name] = lookup.stdout.trim();
	}

	if (includeAuthorizationKey && !process.env.PRIVY_AUTHORIZATION_PUBLIC_KEY) {
		try {
			process.env.PRIVY_AUTHORIZATION_PUBLIC_KEY = (
				await readFile(resolve('.local/privy-authorization-public.txt'), 'utf8')
			).trim();
		} catch (error) {
			if (!error || typeof error !== 'object' || error.code !== 'ENOENT') throw error;
		}
	}
}

async function collect(iterable, limit = 100) {
	const rows = [];
	for await (const row of iterable) {
		rows.push(row);
		if (rows.length >= limit) break;
	}
	return rows;
}

function assertKeyPair(privateKeyBase64, publicKeyBase64) {
	const message = Buffer.from('privy-starter-live-smoke');
	const privateKeyObject = createPrivateKey({
		key: Buffer.from(privateKeyBase64, 'base64'),
		format: 'der',
		type: 'pkcs8'
	});
	const publicKeyObject = createPublicKey({
		key: Buffer.from(publicKeyBase64, 'base64'),
		format: 'der',
		type: 'spki'
	});
	const signature = sign('sha256', message, privateKeyObject);
	if (!verify('sha256', message, publicKeyObject, signature))
		throw new Error('The configured Privy authorization keypair does not match.');
}

async function readState() {
	try {
		return JSON.parse(await readFile(statePath, 'utf8'));
	} catch (error) {
		if (error && typeof error === 'object' && error.code === 'ENOENT') return {};
		throw error;
	}
}

async function saveState(state) {
	await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function summarizeId(value) {
	return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}
