export type ERPNextCredentials = {
	apiKey: string;
	apiSecret: string;
};

export type EncryptedERPNextCredentials = {
	version: 1;
	iv: string;
	ciphertext: string;
	authTag: string;
};

export type ERPNextConnectionTest = {
	remoteUser: string;
	remoteSiteName: string;
	companies: string[];
};

export type ERPNextAccount = {
	providerAccountId: string;
	accountName: string;
	accountNumber?: string;
	rootType?: string;
	accountType?: string;
	parentAccount?: string;
	company?: string;
	isGroup: boolean;
	disabled: boolean;
	accountCurrency?: string;
	providerModifiedAt?: string;
};

export type ERPNextDocumentType = 'purchaseInvoice' | 'salesInvoice';

export type ERPNextReferenceType =
	'supplier' | 'customer' | 'costCenter' | 'currency' | 'employee' | 'item';

export type ERPNextReference = {
	referenceType: ERPNextReferenceType;
	providerReferenceId: string;
	displayName: string;
	company?: string;
	disabled: boolean;
	currency?: string;
	email?: string;
	providerModifiedAt?: string;
};

export type ERPNextOpenInvoice = {
	documentType: ERPNextDocumentType;
	providerDocumentId: string;
	company: string;
	party?: string;
	partyName?: string;
	currency: string;
	grandTotal: string;
	outstandingAmount: string;
	postingDate?: string;
	dueDate?: string;
	status: string;
	providerModifiedAt?: string;
};

export type ERPNextPaymentEntry = {
	providerDocumentId: string;
	docstatus: number;
	remoteReference: string;
	direction: 'pay' | 'receive';
	company: string;
	party: string;
	amount: string;
	invoiceType: ERPNextDocumentType;
	invoiceId: string;
};

export type ERPNextDraftInvoice = {
	documentType: ERPNextDocumentType;
	providerDocumentId: string;
	docstatus: 0 | 1;
	remoteReference: string;
	company: string;
	party: string;
	currency: string;
	grandTotal: string;
	postingDate: string;
	dueDate: string;
	items: Array<{
		itemCode: string;
		quantity: string;
		rate: string;
		account: string;
	}>;
	providerModifiedAt?: string;
};

export type ERPNextDraftInvoiceInput = {
	documentType: ERPNextDocumentType;
	company: string;
	party: string;
	postingDate: string;
	dueDate: string;
	currency: string;
	remoteReference: string;
	items: Array<{
		itemCode: string;
		description: string;
		quantity: string;
		rate: string;
		account: string;
	}>;
};

export type ERPNextSettlementInput = {
	direction: 'pay' | 'receive';
	company: string;
	party: string;
	invoiceType: ERPNextDocumentType;
	invoiceId: string;
	bankAccount: string;
	partyAccount: string;
	amount: string;
	postingDate: string;
	remoteReference: string;
};

export type ERPNextSettlementInvoice = {
	documentType: ERPNextDocumentType;
	providerDocumentId: string;
	company: string;
	party: string;
	currency: string;
	outstandingAmount: string;
	partyAccount: string;
};

export function paymentEntryMatchesSettlement(
	payment: ERPNextPaymentEntry,
	settlement: {
		direction: 'pay' | 'receive';
		company: string;
		party: string;
		amount: string;
		documentType: ERPNextDocumentType;
		providerDocumentId: string;
	}
) {
	return (
		payment.direction === settlement.direction &&
		payment.company === settlement.company &&
		payment.party === settlement.party &&
		payment.amount === settlement.amount &&
		payment.invoiceType === settlement.documentType &&
		payment.invoiceId === settlement.providerDocumentId
	);
}

export interface ErpConnector {
	testConnection(): Promise<ERPNextConnectionTest>;
	listAccounts(): Promise<ERPNextAccount[]>;
	listReferenceData(company: string): Promise<ERPNextReference[]>;
	listOpenInvoices(type: ERPNextDocumentType, company: string): Promise<ERPNextOpenInvoice[]>;
	findDraftInvoiceByReference(
		type: ERPNextDocumentType,
		company: string,
		party: string,
		reference: string
	): Promise<ERPNextDraftInvoice | null>;
	createDraftInvoice(input: ERPNextDraftInvoiceInput): Promise<ERPNextDraftInvoice>;
	getSettlementInvoice(
		type: ERPNextDocumentType,
		providerDocumentId: string
	): Promise<ERPNextSettlementInvoice>;
	findPaymentByReference(reference: string, company: string): Promise<ERPNextPaymentEntry | null>;
	createPaymentEntry(input: ERPNextSettlementInput): Promise<ERPNextPaymentEntry>;
	submitPaymentEntry(payment: ERPNextPaymentEntry): Promise<ERPNextPaymentEntry>;
}

export function normalizeERPNextCredentials(input: ERPNextCredentials): ERPNextCredentials {
	const apiKey = input.apiKey.trim();
	const apiSecret = input.apiSecret.trim();
	if (apiKey.length < 8 || apiKey.length > 256 || apiKey.includes(':'))
		throw new Error('ERPNext API key must be 8 to 256 characters and cannot contain a colon.');
	if (apiSecret.length < 8 || apiSecret.length > 512 || /[\r\n]/.test(apiSecret))
		throw new Error('ERPNext API secret must be 8 to 512 characters.');
	return { apiKey, apiSecret };
}

export function apiKeyHint(apiKey: string) {
	const normalized = apiKey.trim();
	return normalized.length <= 4 ? '****' : `****${normalized.slice(-4)}`;
}
