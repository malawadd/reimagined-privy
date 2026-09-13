'use node';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EncryptedERPNextCredentials, ERPNextCredentials } from './types';
import { normalizeERPNextCredentials } from './types';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function decodeKey(encoded: string): Buffer {
	const value = encoded.trim();
	const key = /^[a-f\d]{64}$/i.test(value)
		? Buffer.from(value, 'hex')
		: Buffer.from(value, 'base64');
	if (key.length !== 32)
		throw new Error('ERP credential encryption key must decode to exactly 32 bytes.');
	return key;
}

function additionalData(context: string) {
	if (!context || context.length > 1_000) throw new Error('Invalid ERP credential context.');
	return Buffer.from(`ratib:erpnext:credentials:v1:${context}`, 'utf8');
}

export function encryptERPNextCredentials(
	credentials: ERPNextCredentials,
	encodedKey: string,
	context: string
): EncryptedERPNextCredentials {
	const normalized = normalizeERPNextCredentials(credentials);
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, decodeKey(encodedKey), iv);
	cipher.setAAD(additionalData(context));
	const ciphertext = Buffer.concat([
		cipher.update(JSON.stringify(normalized), 'utf8'),
		cipher.final()
	]);
	return {
		version: 1,
		iv: iv.toString('base64url'),
		ciphertext: ciphertext.toString('base64url'),
		authTag: cipher.getAuthTag().toString('base64url')
	};
}

export function decryptERPNextCredentials(
	envelope: EncryptedERPNextCredentials,
	encodedKey: string,
	context: string
): ERPNextCredentials {
	if (envelope.version !== 1) throw new Error('Unsupported ERP credential envelope version.');
	const iv = Buffer.from(envelope.iv, 'base64url');
	const authTag = Buffer.from(envelope.authTag, 'base64url');
	if (iv.length !== IV_BYTES || authTag.length !== 16)
		throw new Error('Invalid ERP credential envelope.');
	try {
		const decipher = createDecipheriv(ALGORITHM, decodeKey(encodedKey), iv);
		decipher.setAAD(additionalData(context));
		decipher.setAuthTag(authTag);
		const plaintext = Buffer.concat([
			decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
			decipher.final()
		]).toString('utf8');
		return normalizeERPNextCredentials(JSON.parse(plaintext) as ERPNextCredentials);
	} catch {
		throw new Error('Unable to decrypt ERP credentials.');
	}
}

export function erpCredentialContext(organizationId: string, baseUrl: string) {
	return `${organizationId}:${baseUrl}`;
}
