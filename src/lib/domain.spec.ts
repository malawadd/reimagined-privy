import { describe, expect, it } from 'vitest';
import {
	BASE_SEPOLIA,
	canTransition,
	decimalToUnits,
	deterministicRunKey,
	monotonicStatus,
	normalizeDecimal,
	normalizeEvmAddress,
	selectPaymentRoute,
	unitsToDecimal
} from './domain';

describe('money and address validation', () => {
	it('normalizes decimal strings without floating point', () => {
		expect(normalizeDecimal('001.2300', 6)).toBe('1.23');
		expect(decimalToUnits('100.000001', 6)).toBe(100000001n);
		expect(unitsToDecimal('12500000', 6)).toBe('12.5');
	});
	it('rejects excess precision and invalid addresses', () => {
		expect(() => normalizeDecimal('1.0000001', 6)).toThrow();
		expect(() => normalizeEvmAddress('not-an-address')).toThrow();
	});
	it('uses the canonical Base Sepolia identifiers', () => {
		expect(BASE_SEPOLIA).toMatchObject({
			chainId: 84532,
			caip2: 'eip155:84532',
			transferChain: 'base_sepolia',
			usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
		});
	});
});

describe('control routing and operation state', () => {
	it('routes allowlisted USDC at or below 100 to the signer', () => {
		expect(
			selectPaymentRoute({
				asset: 'USDC',
				amount: '100',
				destination: '0x1',
				recipientApproved: true
			}).path
		).toBe('automationSigner');
	});
	it('routes high-risk and non-allowlisted payments to an intent', () => {
		expect(
			selectPaymentRoute({
				asset: 'USDC',
				amount: '100.000001',
				destination: '0x1',
				recipientApproved: true
			}).path
		).toBe('privyIntent');
		expect(
			selectPaymentRoute({
				asset: 'ETH',
				amount: '0.01',
				destination: '0x1',
				recipientApproved: false
			}).path
		).toBe('privyIntent');
	});
	it('blocks zero-value transfers before selecting a Privy path', () => {
		expect(
			selectPaymentRoute({
				asset: 'USDC',
				amount: '0',
				destination: '0x1',
				recipientApproved: true
			}).path
		).toBe('blocked');
	});
	it('only permits declared transitions', () => {
		expect(canTransition('draft', 'queued')).toBe(true);
		expect(canTransition('succeeded', 'executing')).toBe(false);
	});
	it('does not regress on out-of-order webhook state', () => {
		expect(monotonicStatus('pendingConfirmation', 'executing')).toBe('pendingConfirmation');
		expect(monotonicStatus('executing', 'succeeded')).toBe('succeeded');
	});
	it('creates stable run keys', () => {
		expect(deterministicRunKey('auto_1', 1720000000)).toBe('auto_1:1720000000');
		expect(deterministicRunKey('auto_1', 'evt_1')).toBe('auto_1:evt_1');
	});
});
