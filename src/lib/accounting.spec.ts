import { describe, expect, it } from 'vitest';
import {
	DEFAULT_ACCOUNTS,
	periodContains,
	postingRuleFor,
	reverseJournalLines,
	validateJournalLines
} from './accounting';

describe('accounting rules', () => {
	it('validates exact balanced decimal strings', () => {
		expect(
			validateJournalLines([
				{ accountCode: '1000', debit: '10.25', credit: '0' },
				{ accountCode: '4000', debit: '0', credit: '10.25' }
			])
		).toEqual({ debit: '10.25', credit: '10.25' });
	});

	it('rejects an unbalanced or two-sided line', () => {
		expect(() =>
			validateJournalLines([
				{ accountCode: '1000', debit: '10', credit: '1' },
				{ accountCode: '4000', debit: '0', credit: '9' }
			])
		).toThrow('exactly one');
		expect(() =>
			validateJournalLines([
				{ accountCode: '1000', debit: '10', credit: '0' },
				{ accountCode: '4000', debit: '0', credit: '9' }
			])
		).toThrow('must balance');
	});

	it('reverses without changing the original lines', () => {
		const lines = [
			{ accountCode: '1000', debit: '2', credit: '0' },
			{ accountCode: '4000', debit: '0', credit: '2' }
		];
		expect(reverseJournalLines(lines)).toEqual([
			{ accountCode: '1000', debit: '0', credit: '2' },
			{ accountCode: '4000', debit: '2', credit: '0' }
		]);
		expect(lines[0].debit).toBe('2');
	});

	it('keeps collection sweeps and payroll settlements out of operating expense', () => {
		expect(postingRuleFor({ sourceType: 'operation', isCollectionSweep: true }).key).toBe(
			'wallet.collectionSweep'
		);
		expect(postingRuleFor({ sourceType: 'payroll' }).debit).toBe('2010');
		expect(postingRuleFor({ sourceType: 'payroll', isPayrollAccrual: true })).toMatchObject({
			debit: '5010',
			credit: '2010'
		});
	});

	it('ships a conservative complete posting chart and inclusive periods', () => {
		expect(DEFAULT_ACCOUNTS.map((account) => account.code)).toContain('1190');
		expect(periodContains({ startsAt: 10, endsAt: 20 }, 20)).toBe(true);
	});
});
