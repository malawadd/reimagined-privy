import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateP256KeyPair } from '@privy-io/node';

const keyId = `convex-${new Date().toISOString().slice(0, 10)}`;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const jwk = publicKey.export({ format: 'jwk' });
const jwks = { keys: [{ ...jwk, use: 'sig', alg: 'RS256', kid: keyId }] };
const privyAuthorizationKey = await generateP256KeyPair();
const directory = resolve('.local');
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, 'convex-auth-private.pem'), privatePem, { mode: 0o600 });
writeFileSync(resolve(directory, 'convex-auth.jwks.json'), `${JSON.stringify(jwks, null, 2)}\n`);
writeFileSync(
	resolve(directory, 'privy-authorization-public.txt'),
	`${privyAuthorizationKey.publicKey}\n`,
	{ mode: 0o600 }
);
writeFileSync(
	resolve(directory, 'generated-auth.env'),
	[
		`PRIVY_AUTHORIZATION_PRIVATE_KEY=${privyAuthorizationKey.privateKey}`,
		`AUTH_PRIVATE_KEY_PEM=${privatePem.replace(/\n/g, '\\n')}`,
		'AUTH_ISSUER=https://auth.ratib.local',
		`AUTH_JWT_KID=${keyId}`,
		`CONVEX_AUTH_JWKS=data:application/json,${encodeURIComponent(JSON.stringify(jwks))}`,
		''
	].join('\n'),
	{ mode: 0o600 }
);

console.log(`Generated ${keyId} in .local/.`);
console.log('Generated Convex JWT and Privy P-256 authorization key material only.');
console.log('Import .local/generated-auth.env, then add real Privy credentials separately.');
console.log(
	'Register privy-authorization-public.txt only when promoting this signer to Privy live mode.'
);
console.log(
	'During rotation, publish both old and new public JWKs until every five-minute token has expired.'
);
