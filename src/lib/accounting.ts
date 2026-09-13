import { decimalToUnits, normalizeDecimal, unitsToDecimal, type Asset } from './domain';

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type NormalBalance = 'debit' | 'credit';

export interface JournalLineInput {
	accountCode: string;
	debit: string;
	credit: string;
	asset?: Asset;
	assetQuantity?: string;
	memo?: string;
}

export const DEFAULT_ACCOUNTS = [
	{ code: '1000', name: 'Treasury wallets', type: 'asset', normalBalance: 'debit' },
	{ code: '1010', name: 'Collection wallets', type: 'asset', normalBalance: 'debit' },
	{ code: '1100', name: 'Accounts receivable', type: 'asset', normalBalance: 'debit' },
	{ code: '1190', name: 'Suspense', type: 'asset', normalBalance: 'debit' },
	{ code: '2000', name: 'Accounts payable', type: 'liability', normalBalance: 'credit' },
	{ code: '2010', name: 'Payroll payable', type: 'liability', normalBalance: 'credit' },
	{ code: '2050', name: 'Customer deposits', type: 'liability', normalBalance: 'credit' },
	{ code: '3000', name: 'Owner equity', type: 'equity', normalBalance: 'credit' },
	{ code: '4000', name: 'Revenue', type: 'revenue', normalBalance: 'credit' },
	{ code: '5000', name: 'Operating expense', type: 'expense', normalBalance: 'debit' },
	{ code: '5010', name: 'Payroll expense', type: 'expense', normalBalance: 'debit' },
	{ code: '5090', name: 'Network fees', type: 'expense', normalBalance: 'debit' }
] as const satisfies readonly {
	code: string;
	name: string;
	type: AccountType;
	normalBalance: NormalBalance;
}[];

export const DEFAULT_POSTING_RULES = [
	{ key: 'invoice.issue', debitAccountCode: '1100', creditAccountCode: '4000' },
	{ key: 'invoice.receipt', debitAccountCode: '1010', creditAccountCode: '1100' },
	{ key: 'payable.approve', debitAccountCode: '5000', creditAccountCode: '2000' },
	{ key: 'payable.settle', debitAccountCode: '2000', creditAccountCode: '1000' },
	{ key: 'payroll.approve', debitAccountCode: '5010', creditAccountCode: '2010' },
	{ key: 'payroll.settle', debitAccountCode: '2010', creditAccountCode: '1000' },
	{ key: 'wallet.collectionSweep', debitAccountCode: '1000', creditAccountCode: '1010' },
	{ key: 'payment.settle', debitAccountCode: '5000', creditAccountCode: '1000' }
] as const;

export function validateJournalLines(lines: readonly JournalLineInput[], decimals = 6) {
	if (lines.length < 2) throw new Error('A journal requires at least two lines.');
	let debits = 0n;
	let credits = 0n;
	for (const line of lines) {
		const debit = decimalToUnits(normalizeDecimal(line.debit || '0', decimals), decimals);
		const credit = decimalToUnits(normalizeDecimal(line.credit || '0', decimals), decimals);
		if ((debit === 0n) === (credit === 0n))
			throw new Error('Each journal line must contain exactly one non-zero debit or credit.');
		debits += debit;
		credits += credit;
	}
	if (debits !== credits) throw new Error('Journal debits and credits must balance.');
	return {
		debit: unitsToDecimal(debits.toString(), decimals),
		credit: unitsToDecimal(credits.toString(), decimals)
	};
}

export function reverseJournalLines(lines: readonly JournalLineInput[]): JournalLineInput[] {
	return lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit }));
}

export function postingRuleFor(input: {
	sourceType: 'operation' | 'invoicePayment' | 'invoice' | 'payable' | 'payroll';
	isCollectionSweep?: boolean;
	isPayroll?: boolean;
	isPayrollAccrual?: boolean;
	isPayableSettlement?: boolean;
}) {
	if (input.sourceType === 'invoice')
		return { debit: '1100', credit: '4000', key: 'invoice.issue' };
	if (input.sourceType === 'invoicePayment')
		return { debit: '1010', credit: '1100', key: 'invoice.receipt' };
	if (input.sourceType === 'payable')
		return { debit: '5000', credit: '2000', key: 'payable.approve' };
	if (input.isPayableSettlement) return { debit: '2000', credit: '1000', key: 'payable.settle' };
	if (input.isPayrollAccrual) return { debit: '5010', credit: '2010', key: 'payroll.approve' };
	if (input.sourceType === 'payroll' || input.isPayroll)
		return { debit: '2010', credit: '1000', key: 'payroll.settle' };
	if (input.isCollectionSweep)
		return { debit: '1000', credit: '1010', key: 'wallet.collectionSweep' };
	return { debit: '5000', credit: '1000', key: 'payment.settle' };
}

export function periodContains(period: { startsAt: number; endsAt: number }, postingDate: number) {
	return postingDate >= period.startsAt && postingDate <= period.endsAt;
}
