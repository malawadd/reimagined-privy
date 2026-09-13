import { describe, expect, it, vi } from 'vitest';
import {
	ERPNextGatewayError,
	LiveERPNextGateway,
	normalizeERPNextBaseUrl,
	resolvePublicAddress,
	type ERPNextJsonRequest
} from './gateway';
import { paymentEntryMatchesSettlement, type ERPNextPaymentEntry } from './types';

describe('ERPNext gateway safety', () => {
	it.each([
		'http://erp.example.com',
		'https://localhost',
		'https://erp.internal',
		'https://erp.example.com:8443',
		'https://user:pass@erp.example.com',
		'https://erp.example.com/path',
		'https://erp.example.com/?next=https://example.org'
	])('rejects an unsafe base URL: %s', (value) => {
		expect(() => normalizeERPNextBaseUrl(value)).toThrow(ERPNextGatewayError);
	});

	it('canonicalizes a public HTTPS origin', () => {
		expect(normalizeERPNextBaseUrl(' https://ERP.Example.com/ ')).toBe('https://erp.example.com');
	});

	it.each(['127.0.0.1', '10.2.3.4', '169.254.169.254', '192.168.1.1', '::1', 'fd00::1'])(
		'rejects a private or reserved resolved address: %s',
		async (address) => {
			await expect(resolvePublicAddress(address)).rejects.toMatchObject({
				code: 'private_address',
				retryable: false
			});
		}
	);
});

describe('ERPNext REST contract', () => {
	it('requires every immutable settlement field to match during reconciliation', () => {
		const payment: ERPNextPaymentEntry = {
			providerDocumentId: 'ACC-PAY-1',
			docstatus: 1,
			remoteReference: 'RATIB-OP-source',
			direction: 'pay',
			company: 'Ratib Ltd',
			party: 'SUP-001',
			amount: '25.5',
			invoiceType: 'purchaseInvoice',
			invoiceId: 'PINV-0001'
		};
		const settlement = {
			direction: 'pay' as const,
			company: 'Ratib Ltd',
			party: 'SUP-001',
			amount: '25.5',
			documentType: 'purchaseInvoice' as const,
			providerDocumentId: 'PINV-0001'
		};
		expect(paymentEntryMatchesSettlement(payment, settlement)).toBe(true);
		for (const changed of [
			{ ...payment, company: 'Other Ltd' },
			{ ...payment, party: 'SUP-999' },
			{ ...payment, amount: '25.51' },
			{ ...payment, direction: 'receive' as const },
			{ ...payment, invoiceId: 'PINV-9999' }
		])
			expect(paymentEntryMatchesSettlement(changed, settlement)).toBe(false);
	});
	it('authenticates with a Frappe token and requests the documented account fields', async () => {
		const transport = vi.fn<ERPNextJsonRequest>(async ({ url }) => {
			if (url.pathname.endsWith('get_logged_user')) return { message: 'api@example.com' };
			if (url.pathname.endsWith('/Company')) return { data: [{ name: 'Ratib Ltd' }] };
			return {
				data: [
					{
						name: 'Cash - RTL',
						account_name: 'Cash',
						account_number: '1000',
						root_type: 'Asset',
						is_group: 0,
						disabled: 0,
						account_currency: 'USD'
					}
				]
			};
		});
		const gateway = new LiveERPNextGateway(
			'https://erp.example.com',
			{ apiKey: 'api-key-1234', apiSecret: 'api-secret-1234' },
			transport
		);

		await expect(gateway.testConnection()).resolves.toEqual({
			remoteUser: 'api@example.com',
			remoteSiteName: 'erp.example.com',
			companies: ['Ratib Ltd']
		});
		await expect(gateway.listAccounts()).resolves.toEqual([
			{
				providerAccountId: 'Cash - RTL',
				accountName: 'Cash',
				accountNumber: '1000',
				rootType: 'Asset',
				isGroup: false,
				disabled: false,
				accountCurrency: 'USD'
			}
		]);
		const accountRequest = transport.mock.calls.find(([request]) =>
			request.url.pathname.endsWith('/Account')
		);
		expect(accountRequest?.[0].url.searchParams.get('limit_page_length')).toBe('200');
		expect(accountRequest?.[0].url.searchParams.get('fields')).toContain('account_currency');
		expect(
			transport.mock.calls.every(
				([request]) => request.authorization === 'token api-key-1234:api-secret-1234'
			)
		).toBe(true);
	});

	it('fails closed on malformed provider payloads', async () => {
		const transport: ERPNextJsonRequest = async () => ({ data: [{ account_name: 'No id' }] });
		const gateway = new LiveERPNextGateway(
			'https://erp.example.com',
			{ apiKey: 'api-key-1234', apiSecret: 'api-secret-1234' },
			transport
		);
		await expect(gateway.listAccounts()).rejects.toMatchObject({
			code: 'invalid_response',
			retryable: false
		});
	});

	it('rejects oversized provider fields before they reach persistence', async () => {
		const transport: ERPNextJsonRequest = async () => ({
			data: [{ name: 'x'.repeat(513), account_name: 'Oversized', is_group: 0, disabled: 0 }]
		});
		const gateway = new LiveERPNextGateway(
			'https://erp.example.com',
			{ apiKey: 'api-key-1234', apiSecret: 'api-secret-1234' },
			transport
		);
		await expect(gateway.listAccounts()).rejects.toMatchObject({
			code: 'invalid_response',
			retryable: false
		});
	});

	it('pulls company-scoped submitted invoices with positive outstanding balances', async () => {
		const transport = vi.fn<ERPNextJsonRequest>(async () => ({
			data: [
				{
					name: 'PINV-0001',
					company: 'Ratib Ltd',
					supplier: 'SUP-001',
					supplier_name: 'Supplier One',
					currency: 'USD',
					grand_total: '125.5',
					outstanding_amount: '25.5',
					status: 'Partly Paid'
				}
			]
		}));
		const gateway = new LiveERPNextGateway(
			'https://erp.example.com',
			{ apiKey: 'api-key-1234', apiSecret: 'api-secret-1234' },
			transport
		);
		await expect(gateway.listOpenInvoices('purchaseInvoice', 'Ratib Ltd')).resolves.toEqual([
			{
				documentType: 'purchaseInvoice',
				providerDocumentId: 'PINV-0001',
				company: 'Ratib Ltd',
				party: 'SUP-001',
				partyName: 'Supplier One',
				currency: 'USD',
				grandTotal: '125.5',
				outstandingAmount: '25.5',
				status: 'Partly Paid'
			}
		]);
		const filters = transport.mock.calls[0][0].url.searchParams.get('filters');
		expect(filters).toContain('["company","=","Ratib Ltd"]');
		expect(filters).toContain('["docstatus","=",1]');
		expect(filters).toContain('["outstanding_amount",">",0]');
	});

	it('creates and submits a referenced Payment Entry using official Frappe endpoints', async () => {
		const entry = (docstatus: 0 | 1) => ({
			name: 'ACC-PAY-1',
			docstatus,
			reference_no: 'RATIB-OP-source',
			payment_type: 'Pay',
			company: 'Ratib Ltd',
			party: 'SUP-001',
			paid_amount: '25.5',
			references: [
				{
					reference_doctype: 'Purchase Invoice',
					reference_name: 'PINV-0001',
					allocated_amount: '25.5'
				}
			]
		});
		const transport = vi.fn<ERPNextJsonRequest>(async ({ url, method, body }) => {
			if (method === 'POST' && url.pathname.endsWith('/Payment%20Entry')) return { data: entry(0) };
			if (method === 'GET' && url.pathname.endsWith('/ACC-PAY-1')) return { data: entry(0) };
			if (url.pathname.endsWith('frappe.client.submit')) return { message: entry(1) };
			throw new Error(`Unexpected ${method} ${url.pathname} ${JSON.stringify(body)}`);
		});
		const gateway = new LiveERPNextGateway(
			'https://erp.example.com',
			{ apiKey: 'api-key-1234', apiSecret: 'api-secret-1234' },
			transport
		);
		const draft = await gateway.createPaymentEntry({
			direction: 'pay',
			company: 'Ratib Ltd',
			party: 'SUP-001',
			invoiceType: 'purchaseInvoice',
			invoiceId: 'PINV-0001',
			bankAccount: 'Bank - RTL',
			partyAccount: 'Creditors - RTL',
			amount: '25.5',
			postingDate: '2026-09-13',
			remoteReference: 'RATIB-OP-source'
		});
		await expect(gateway.submitPaymentEntry(draft)).resolves.toMatchObject({
			providerDocumentId: 'ACC-PAY-1',
			docstatus: 1
		});
		const create = transport.mock.calls.find(
			([request]) => request.method === 'POST' && request.url.pathname.endsWith('/Payment%20Entry')
		)?.[0];
		expect(create?.body).toMatchObject({
			payment_type: 'Pay',
			paid_from: 'Bank - RTL',
			paid_to: 'Creditors - RTL',
			paid_amount: '25.5',
			reference_no: 'RATIB-OP-source'
		});
		expect(create?.body?.references).toEqual([
			{
				reference_doctype: 'Purchase Invoice',
				reference_name: 'PINV-0001',
				allocated_amount: '25.5'
			}
		]);
	});

	it('loads the full Payment Entry when reconciling a reference', async () => {
		const transport = vi.fn<ERPNextJsonRequest>(async ({ url }) => {
			if (url.pathname.endsWith('/Payment%20Entry')) return { data: [{ name: 'ACC-PAY-1' }] };
			return {
				data: {
					name: 'ACC-PAY-1',
					docstatus: 1,
					reference_no: 'RATIB-OP-source',
					payment_type: 'Pay',
					company: 'Ratib Ltd',
					party: 'SUP-001',
					paid_amount: '25.5',
					references: [
						{
							reference_doctype: 'Purchase Invoice',
							reference_name: 'PINV-0001',
							allocated_amount: '25.5'
						}
					]
				}
			};
		});
		const gateway = new LiveERPNextGateway(
			'https://erp.example.com',
			{ apiKey: 'api-key-1234', apiSecret: 'api-secret-1234' },
			transport
		);
		await expect(
			gateway.findPaymentByReference('RATIB-OP-source', 'Ratib Ltd')
		).resolves.toMatchObject({
			direction: 'pay',
			company: 'Ratib Ltd',
			party: 'SUP-001',
			amount: '25.5',
			invoiceType: 'purchaseInvoice',
			invoiceId: 'PINV-0001'
		});
		expect(transport).toHaveBeenCalledTimes(2);
	});

	it('imports the reference masters needed to create finance documents', async () => {
		const transport = vi.fn<ERPNextJsonRequest>(async ({ url }) => {
			const type = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
			const rows: Record<string, Record<string, unknown>> = {
				Supplier: { name: 'SUP-001', supplier_name: 'Supplier One', disabled: 0 },
				Customer: { name: 'CUS-001', customer_name: 'Customer One', disabled: 0 },
				'Cost Center': {
					name: 'Main - RTL',
					cost_center_name: 'Main',
					company: 'Ratib Ltd',
					disabled: 0
				},
				Currency: { name: 'USD', currency_name: 'US Dollar', enabled: 1 },
				Employee: {
					name: 'HR-EMP-001',
					employee_name: 'Amina',
					company: 'Ratib Ltd',
					status: 'Active',
					user_id: 'amina@example.com'
				},
				Item: { name: 'SERVICE', item_name: 'Services', disabled: 0 }
			};
			return { data: [rows[type]] };
		});
		const gateway = new LiveERPNextGateway(
			'https://erp.example.com',
			{ apiKey: 'api-key-1234', apiSecret: 'api-secret-1234' },
			transport
		);
		const references = await gateway.listReferenceData('Ratib Ltd');
		expect(references).toHaveLength(6);
		expect(references).toContainEqual({
			referenceType: 'employee',
			providerReferenceId: 'HR-EMP-001',
			displayName: 'Amina',
			company: 'Ratib Ltd',
			disabled: false,
			email: 'amina@example.com'
		});
		const costCenterCall = transport.mock.calls.find(([request]) =>
			request.url.pathname.endsWith('/Cost%20Center')
		);
		expect(costCenterCall?.[0].url.searchParams.get('filters')).toContain('Ratib Ltd');
	});

	it('looks up a deterministic reference before creating an unsubmitted invoice draft', async () => {
		let existing = false;
		const draftDocument = {
			name: 'SINV-0001',
			docstatus: 0,
			po_no: 'RATIB-INV-source',
			company: 'Ratib Ltd',
			customer: 'CUS-001',
			currency: 'USD',
			grand_total: '100',
			posting_date: '2026-09-13',
			due_date: '2026-09-30',
			items: [
				{
					item_code: 'SERVICE',
					qty: '2',
					rate: '50',
					income_account: 'Services - RTL'
				}
			]
		};
		const transport = vi.fn<ERPNextJsonRequest>(async ({ url, method, body }) => {
			if (method === 'GET' && url.pathname.endsWith('/Sales%20Invoice'))
				return { data: existing ? [{ name: 'SINV-0001' }] : [] };
			if (method === 'GET') return { data: draftDocument };
			existing = true;
			return {
				data: { ...draftDocument, po_no: String(body?.po_no) }
			};
		});
		const gateway = new LiveERPNextGateway(
			'https://erp.example.com',
			{ apiKey: 'api-key-1234', apiSecret: 'api-secret-1234' },
			transport
		);
		await expect(
			gateway.findDraftInvoiceByReference(
				'salesInvoice',
				'Ratib Ltd',
				'CUS-001',
				'RATIB-INV-source'
			)
		).resolves.toBeNull();
		const draft = await gateway.createDraftInvoice({
			documentType: 'salesInvoice',
			company: 'Ratib Ltd',
			party: 'CUS-001',
			postingDate: '2026-09-13',
			dueDate: '2026-09-30',
			currency: 'USD',
			remoteReference: 'RATIB-INV-source',
			items: [
				{
					itemCode: 'SERVICE',
					description: 'Advisory',
					quantity: '2',
					rate: '50',
					account: 'Services - RTL'
				}
			]
		});
		expect(draft).toMatchObject({ providerDocumentId: 'SINV-0001', docstatus: 0 });
		await expect(
			gateway.findDraftInvoiceByReference(
				'salesInvoice',
				'Ratib Ltd',
				'CUS-001',
				'RATIB-INV-source'
			)
		).resolves.toMatchObject({ providerDocumentId: 'SINV-0001' });
		const create = transport.mock.calls.find(([request]) => request.method === 'POST')?.[0];
		expect(create?.body).toMatchObject({
			customer: 'CUS-001',
			po_no: 'RATIB-INV-source',
			items: [
				{
					item_code: 'SERVICE',
					income_account: 'Services - RTL',
					qty: '2',
					rate: '50'
				}
			]
		});
	});
});
