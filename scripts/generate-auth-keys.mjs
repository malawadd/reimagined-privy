import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const keyId = `convex-${new Date().toISOString().slice(0, 10)}`;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const jwk = createPublicKey(publicKey).export({ format: 'jwk' });
const jwks = { keys: [{ ...jwk, use: 'sig', alg: 'RS256', kid: keyId }] };
const directory = resolve('.local');
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, 'convex-auth-private.pem'), privatePem, { mode: 0o600 });
writeFileSync(resolve(directory, 'convex-auth.jwks.json'), `${JSON.stringify(jwks, null, 2)}\n`);

console.log(`Generated ${keyId} in .local/.`);
console.log(
	'Store the private PEM as AUTH_PRIVATE_KEY_PEM in Convex, then delete the local private file.'
);
console.log(
	'Set AUTH_JWT_KID to the printed key ID and encode convex-auth.jwks.json as CONVEX_AUTH_JWKS.'
);
console.log(
	'During rotation, publish both old and new public JWKs until every five-minute token has expired.'
);
