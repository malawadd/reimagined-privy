import { describe, expect, it } from 'vitest';
import { parseCsvRecords } from './payout-csv';

describe('payout CSV', () => {
	it('parses quoted values and preserves source row numbers', () => {
		expect(
			parseCsvRecords('member,amount,memo\nmember@example.com,10.25,"Salary, September"')
		).toEqual([
			{
				sourceRow: 2,
				values: { member: 'member@example.com', amount: '10.25', memo: 'Salary, September' }
			}
		]);
	});

	it('rejects duplicate headers and malformed quotes', () => {
		expect(() => parseCsvRecords('amount,amount\n1,2')).toThrow('headers must be unique');
		expect(() => parseCsvRecords('member,memo\na,"unfinished')).toThrow('unterminated');
	});
});
