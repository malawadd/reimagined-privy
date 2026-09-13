'use node';

import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { decimalToUnits, normalizeDecimal } from '../../lib/domain';
import type {
	ERPNextAccount,
	ERPNextConnectionTest,
	ERPNextCredentials,
	ERPNextDocumentType,
	ERPNextOpenInvoice,
	ERPNextPaymentEntry,
	ERPNextReference,
	ERPNextDraftInvoice,
	ERPNextDraftInvoiceInput,
	ERPNextSettlementInput,
	ERPNextSettlementInvoice,
	ErpConnector
} from './types';
import { normalizeERPNextCredentials } from './types';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 200;
const MAX_ACCOUNT_PAGES = 10;
const MAX_FIELD_LENGTH = 512;
const MAX_REQUEST_BYTES = 256 * 1024;

export class ERPNextGatewayError extends Error {
	constructor(
		public readonly code: string,
		public readonly retryable: boolean,
		public readonly status?: number
	) {
		super(publicMessageForCode(code));
		this.name = 'ERPNextGatewayError';
	}
}

function publicMessageForCode(code: string) {
	const messages: Record<string, string> = {
		invalid_url: 'ERPNext URL must be a public HTTPS origin.',
		private_address: 'ERPNext URL resolves to a private or reserved network.',
		dns_failed: 'ERPNext hostname could not be resolved.',
		connection_failed: 'ERPNext could not be reached.',
		request_timeout: 'ERPNext did not respond before the timeout.',
		invalid_credentials: 'ERPNext rejected the API credentials.',
		permission_denied: 'The ERPNext API user does not have the required read permissions.',
		rate_limited: 'ERPNext rate-limited the request.',
		provider_unavailable: 'ERPNext is temporarily unavailable.',
		invalid_response: 'ERPNext returned an unexpected response.',
		response_too_large: 'ERPNext returned more data than Ratib can safely process.',
		unsafe_redirect: 'ERPNext returned an unsafe redirect.',
		company_required: 'Select an ERPNext company before syncing invoices.',
		stale_invoice: 'ERPNext invoice changed after the last sync. Sync invoices and review again.',
		stale_draft:
			'ERPNext draft changed after Ratib created it. Review the reconciliation exception.'
	};
	return messages[code] ?? 'ERPNext request failed.';
}

export function normalizeERPNextBaseUrl(value: string) {
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		throw new ERPNextGatewayError('invalid_url', false);
	}
	if (
		url.protocol !== 'https:' ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		(url.port && url.port !== '443') ||
		(url.pathname !== '/' && url.pathname !== '')
	)
		throw new ERPNextGatewayError('invalid_url', false);
	const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
	if (
		!hostname ||
		hostname === 'localhost' ||
		hostname.endsWith('.localhost') ||
		hostname.endsWith('.local') ||
		hostname.endsWith('.internal') ||
		hostname.endsWith('.lan') ||
		hostname.endsWith('.home.arpa') ||
		(!isIP(hostname) && !hostname.includes('.'))
	)
		throw new ERPNextGatewayError('invalid_url', false);
	url.hostname = hostname;
	url.pathname = '/';
	return url.origin;
}

function isBlockedIpv4(address: string) {
	const octets = address.split('.').map(Number);
	if (
		octets.length !== 4 ||
		octets.some((item) => !Number.isInteger(item) || item < 0 || item > 255)
	)
		return true;
	const [a, b, c] = octets;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 0 && c === 0) ||
		(a === 192 && b === 0 && c === 2) ||
		(a === 192 && b === 88 && c === 99) ||
		(a === 192 && b === 168) ||
		(a === 198 && (b === 18 || b === 19)) ||
		(a === 198 && b === 51 && c === 100) ||
		(a === 203 && b === 0 && c === 113) ||
		a >= 224
	);
}

function isBlockedAddress(address: string) {
	const version = isIP(address);
	if (version === 4) return isBlockedIpv4(address);
	if (version !== 6) return true;
	const normalized = address.toLowerCase();
	if (normalized.startsWith('::ffff:')) {
		const mapped = normalized.slice(7);
		return isIP(mapped) !== 4 || isBlockedIpv4(mapped);
	}
	return (
		normalized === '::' ||
		normalized === '::1' ||
		!/^[23]/.test(normalized) ||
		normalized.startsWith('fc') ||
		normalized.startsWith('fd') ||
		/^fe[89ab]/.test(normalized) ||
		normalized.startsWith('2001:db8:')
	);
}

export async function resolvePublicAddress(hostname: string) {
	if (isIP(hostname)) {
		if (isBlockedAddress(hostname)) throw new ERPNextGatewayError('private_address', false);
		return { address: hostname, family: isIP(hostname) as 4 | 6 };
	}
	let addresses: Array<{ address: string; family: 4 | 6 }>;
	try {
		addresses = (await lookup(hostname, { all: true, verbatim: true })).map((item) => ({
			address: item.address,
			family: item.family === 6 ? 6 : 4
		}));
	} catch {
		throw new ERPNextGatewayError('dns_failed', true);
	}
	if (!addresses.length) throw new ERPNextGatewayError('dns_failed', true);
	if (addresses.some((item) => isBlockedAddress(item.address)))
		throw new ERPNextGatewayError('private_address', false);
	return addresses[0];
}

type JsonObject = Record<string, unknown>;

const MONETARY_FIELDS = new Set([
	'grand_total',
	'outstanding_amount',
	'paid_amount',
	'received_amount',
	'allocated_amount',
	'qty',
	'rate'
]);

function parseResponseJson(body: string): JsonObject {
	try {
		const parseLosslessMoney = JSON.parse as (
			text: string,
			reviver: (key: string, value: unknown, context?: { source?: string }) => unknown
		) => unknown;
		const parsed = parseLosslessMoney(body, (key, value, context) =>
			MONETARY_FIELDS.has(key) && typeof value === 'number' && context?.source
				? context.source
				: value
		);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
		return parsed as JsonObject;
	} catch {
		throw new ERPNextGatewayError('invalid_response', false);
	}
}

async function pinnedJsonRequest(
	input: ERPNextRequest,
	redirectsRemaining = 2
): Promise<JsonObject> {
	const { url, authorization, expectedOrigin, method } = input;
	const resolved = await resolvePublicAddress(url.hostname);
	const encodedBody =
		input.body === undefined ? undefined : Buffer.from(JSON.stringify(input.body));
	if (encodedBody && encodedBody.length > MAX_REQUEST_BYTES)
		throw new ERPNextGatewayError('invalid_response', false);
	return new Promise((resolve, reject) => {
		const request = httpsRequest(
			{
				protocol: 'https:',
				hostname: resolved.address,
				family: resolved.family,
				port: 443,
				servername: url.hostname,
				method,
				path: `${url.pathname}${url.search}`,
				headers: {
					accept: 'application/json',
					authorization,
					host: url.host,
					...(encodedBody
						? { 'content-type': 'application/json', 'content-length': String(encodedBody.length) }
						: {}),
					'user-agent': 'Ratib-ERPNext/1.0'
				}
			},
			(response) => {
				const status = response.statusCode ?? 0;
				if (status >= 300 && status < 400) {
					response.resume();
					const location = response.headers.location;
					if (method !== 'GET' || !location || redirectsRemaining === 0) {
						reject(new ERPNextGatewayError('unsafe_redirect', false, status));
						return;
					}
					let redirected: URL;
					try {
						redirected = new URL(location, url);
					} catch {
						reject(new ERPNextGatewayError('unsafe_redirect', false, status));
						return;
					}
					if (redirected.origin !== expectedOrigin || redirected.protocol !== 'https:') {
						reject(new ERPNextGatewayError('unsafe_redirect', false, status));
						return;
					}
					void pinnedJsonRequest({ ...input, url: redirected }, redirectsRemaining - 1).then(
						resolve,
						reject
					);
					return;
				}

				const chunks: Buffer[] = [];
				let bytes = 0;
				response.on('data', (chunk: Buffer) => {
					bytes += chunk.length;
					if (bytes > MAX_RESPONSE_BYTES) {
						request.destroy(new ERPNextGatewayError('response_too_large', false));
						return;
					}
					chunks.push(chunk);
				});
				response.on('end', () => {
					const body = Buffer.concat(chunks).toString('utf8');
					if (status === 401)
						return reject(new ERPNextGatewayError('invalid_credentials', false, status));
					if (status === 403)
						return reject(new ERPNextGatewayError('permission_denied', false, status));
					if (status === 429) return reject(new ERPNextGatewayError('rate_limited', true, status));
					if (status >= 500)
						return reject(new ERPNextGatewayError('provider_unavailable', true, status));
					if (status < 200 || status >= 300)
						return reject(new ERPNextGatewayError('invalid_response', false, status));
					try {
						resolve(parseResponseJson(body));
					} catch (error) {
						reject(error);
					}
				});
			}
		);
		request.setTimeout(REQUEST_TIMEOUT_MS, () =>
			request.destroy(new ERPNextGatewayError('request_timeout', true))
		);
		request.on('error', (error) => {
			reject(
				error instanceof ERPNextGatewayError
					? error
					: new ERPNextGatewayError('connection_failed', true)
			);
		});
		request.end(encodedBody);
	});
}

function stringField(value: unknown) {
	if (typeof value !== 'string' || !value.trim()) return undefined;
	const normalized = value.trim();
	if (normalized.length > MAX_FIELD_LENGTH)
		throw new ERPNextGatewayError('invalid_response', false);
	return normalized;
}

function requiredString(value: unknown) {
	const normalized = stringField(value);
	if (!normalized) throw new ERPNextGatewayError('invalid_response', false);
	return normalized;
}

function decimalField(value: unknown) {
	if (typeof value !== 'string') throw new ERPNextGatewayError('invalid_response', false);
	try {
		return normalizeDecimal(value, 18);
	} catch {
		throw new ERPNextGatewayError('invalid_response', false);
	}
}

function paymentEntry(value: unknown, expectedReference: string): ERPNextPaymentEntry {
	if (!value || typeof value !== 'object') throw new ERPNextGatewayError('invalid_response', false);
	const row = value as JsonObject;
	const docstatus =
		typeof row.docstatus === 'number'
			? row.docstatus
			: typeof row.docstatus === 'string'
				? Number(row.docstatus)
				: Number.NaN;
	if (!Number.isInteger(docstatus) || (docstatus !== 0 && docstatus !== 1))
		throw new ERPNextGatewayError('invalid_response', false);
	const remoteReference = stringField(row.reference_no) ?? expectedReference;
	if (remoteReference !== expectedReference)
		throw new ERPNextGatewayError('invalid_response', false);
	const paymentType = requiredString(row.payment_type);
	const direction =
		paymentType === 'Pay' ? 'pay' : paymentType === 'Receive' ? 'receive' : undefined;
	if (!direction) throw new ERPNextGatewayError('invalid_response', false);
	if (!Array.isArray(row.references) || row.references.length !== 1)
		throw new ERPNextGatewayError('invalid_response', false);
	const reference = row.references[0];
	if (!reference || typeof reference !== 'object')
		throw new ERPNextGatewayError('invalid_response', false);
	const linked = reference as JsonObject;
	const referenceDoctype = requiredString(linked.reference_doctype);
	const invoiceType =
		referenceDoctype === 'Purchase Invoice'
			? 'purchaseInvoice'
			: referenceDoctype === 'Sales Invoice'
				? 'salesInvoice'
				: undefined;
	if (!invoiceType) throw new ERPNextGatewayError('invalid_response', false);
	const amount = decimalField(
		direction === 'pay'
			? (row.paid_amount ?? linked.allocated_amount)
			: (row.received_amount ?? linked.allocated_amount)
	);
	if (decimalToUnits(amount, 18) !== decimalToUnits(decimalField(linked.allocated_amount), 18))
		throw new ERPNextGatewayError('invalid_response', false);
	return {
		providerDocumentId: requiredString(row.name),
		docstatus,
		remoteReference,
		direction,
		company: requiredString(row.company),
		party: requiredString(row.party),
		amount,
		invoiceType,
		invoiceId: requiredString(linked.reference_name)
	};
}

function draftInvoice(
	value: unknown,
	documentType: ERPNextDocumentType,
	expectedReference: string
): ERPNextDraftInvoice {
	if (!value || typeof value !== 'object') throw new ERPNextGatewayError('invalid_response', false);
	const row = value as JsonObject;
	const parsedDocstatus = Number(row.docstatus);
	if (parsedDocstatus !== 0 && parsedDocstatus !== 1)
		throw new ERPNextGatewayError('invalid_response', false);
	const docstatus = parsedDocstatus as 0 | 1;
	const referenceField = documentType === 'purchaseInvoice' ? row.bill_no : row.po_no;
	const partyField = documentType === 'purchaseInvoice' ? row.supplier : row.customer;
	const accountField = documentType === 'purchaseInvoice' ? 'expense_account' : 'income_account';
	const remoteReference = requiredString(referenceField);
	if (remoteReference !== expectedReference)
		throw new ERPNextGatewayError('invalid_response', false);
	if (!Array.isArray(row.items) || row.items.length < 1 || row.items.length > 50)
		throw new ERPNextGatewayError('invalid_response', false);
	return {
		documentType,
		providerDocumentId: requiredString(row.name),
		docstatus,
		remoteReference,
		company: requiredString(row.company),
		party: requiredString(partyField),
		currency: requiredString(row.currency),
		grandTotal: decimalField(row.grand_total),
		postingDate: requiredString(row.posting_date),
		dueDate: requiredString(row.due_date),
		items: row.items.map((item) => {
			if (!item || typeof item !== 'object')
				throw new ERPNextGatewayError('invalid_response', false);
			const line = item as JsonObject;
			return {
				itemCode: requiredString(line.item_code),
				quantity: decimalField(line.qty),
				rate: decimalField(line.rate),
				account: requiredString(line[accountField])
			};
		}),
		providerModifiedAt: stringField(row.modified)
	};
}

function booleanField(value: unknown) {
	return value === true || value === 1 || value === '1';
}

export type ERPNextGateway = ErpConnector;

export type ERPNextRequest = {
	url: URL;
	authorization: string;
	expectedOrigin: string;
	method: 'GET' | 'POST';
	body?: JsonObject;
};

export type ERPNextJsonRequest = (input: ERPNextRequest) => Promise<JsonObject>;

export class LiveERPNextGateway implements ERPNextGateway {
	private readonly baseUrl: string;
	private readonly authorization: string;

	constructor(
		baseUrl: string,
		credentials: ERPNextCredentials,
		private readonly transport: ERPNextJsonRequest = pinnedJsonRequest
	) {
		this.baseUrl = normalizeERPNextBaseUrl(baseUrl);
		const normalized = normalizeERPNextCredentials(credentials);
		this.authorization = `token ${normalized.apiKey}:${normalized.apiSecret}`;
	}

	private request(
		pathname: string,
		params?: URLSearchParams,
		method: 'GET' | 'POST' = 'GET',
		body?: JsonObject
	) {
		const url = new URL(pathname, this.baseUrl);
		if (params) url.search = params.toString();
		return this.transport({
			url,
			authorization: this.authorization,
			expectedOrigin: this.baseUrl,
			method,
			body
		});
	}

	async testConnection(): Promise<ERPNextConnectionTest> {
		const [userResponse, companyResponse] = await Promise.all([
			this.request('/api/method/frappe.auth.get_logged_user'),
			this.request(
				'/api/resource/Company',
				new URLSearchParams({ fields: JSON.stringify(['name']), limit_page_length: '100' })
			)
		]);
		const remoteUser = stringField(userResponse.message);
		const data = companyResponse.data;
		if (!remoteUser || !Array.isArray(data))
			throw new ERPNextGatewayError('invalid_response', false);
		const companies = data
			.map((item) =>
				item && typeof item === 'object' ? stringField((item as JsonObject).name) : undefined
			)
			.filter((item): item is string => Boolean(item));
		return {
			remoteUser,
			remoteSiteName: new URL(this.baseUrl).hostname,
			companies
		};
	}

	async listAccounts(): Promise<ERPNextAccount[]> {
		const fields = [
			'name',
			'account_name',
			'account_number',
			'root_type',
			'account_type',
			'parent_account',
			'company',
			'is_group',
			'disabled',
			'account_currency',
			'modified'
		];
		const accounts: ERPNextAccount[] = [];
		for (let page = 0; page < MAX_ACCOUNT_PAGES; page += 1) {
			const response = await this.request(
				'/api/resource/Account',
				new URLSearchParams({
					fields: JSON.stringify(fields),
					limit_start: String(page * PAGE_SIZE),
					limit_page_length: String(PAGE_SIZE),
					order_by: 'name asc'
				})
			);
			if (!Array.isArray(response.data)) throw new ERPNextGatewayError('invalid_response', false);
			for (const item of response.data) {
				if (!item || typeof item !== 'object')
					throw new ERPNextGatewayError('invalid_response', false);
				const row = item as JsonObject;
				const providerAccountId = stringField(row.name);
				const accountName = stringField(row.account_name) ?? providerAccountId;
				if (!providerAccountId || !accountName)
					throw new ERPNextGatewayError('invalid_response', false);
				accounts.push({
					providerAccountId,
					accountName,
					accountNumber: stringField(row.account_number),
					rootType: stringField(row.root_type),
					accountType: stringField(row.account_type),
					parentAccount: stringField(row.parent_account),
					company: stringField(row.company),
					isGroup: booleanField(row.is_group),
					disabled: booleanField(row.disabled),
					accountCurrency: stringField(row.account_currency),
					providerModifiedAt: stringField(row.modified)
				});
			}
			if (response.data.length < PAGE_SIZE) return accounts;
		}
		throw new ERPNextGatewayError('response_too_large', false);
	}

	async listReferenceData(company: string): Promise<ERPNextReference[]> {
		const normalizedCompany = requiredString(company);
		const resources: Array<{
			referenceType: ERPNextReference['referenceType'];
			doctype: string;
			nameField: string;
			fields: string[];
			filters?: unknown[];
		}> = [
			{
				referenceType: 'supplier',
				doctype: 'Supplier',
				nameField: 'supplier_name',
				fields: ['name', 'supplier_name', 'disabled', 'default_currency', 'modified']
			},
			{
				referenceType: 'customer',
				doctype: 'Customer',
				nameField: 'customer_name',
				fields: ['name', 'customer_name', 'disabled', 'default_currency', 'modified']
			},
			{
				referenceType: 'costCenter',
				doctype: 'Cost Center',
				nameField: 'cost_center_name',
				fields: ['name', 'cost_center_name', 'company', 'disabled', 'modified'],
				filters: [['company', '=', normalizedCompany]]
			},
			{
				referenceType: 'currency',
				doctype: 'Currency',
				nameField: 'currency_name',
				fields: ['name', 'currency_name', 'enabled', 'modified']
			},
			{
				referenceType: 'employee',
				doctype: 'Employee',
				nameField: 'employee_name',
				fields: ['name', 'employee_name', 'company', 'status', 'user_id', 'modified'],
				filters: [['company', '=', normalizedCompany]]
			},
			{
				referenceType: 'item',
				doctype: 'Item',
				nameField: 'item_name',
				fields: ['name', 'item_name', 'disabled', 'modified']
			}
		];
		const result: ERPNextReference[] = [];
		for (const resource of resources) {
			for (let page = 0; page < MAX_ACCOUNT_PAGES; page += 1) {
				const response = await this.request(
					`/api/resource/${encodeURIComponent(resource.doctype)}`,
					new URLSearchParams({
						fields: JSON.stringify(resource.fields),
						...(resource.filters ? { filters: JSON.stringify(resource.filters) } : {}),
						limit_start: String(page * PAGE_SIZE),
						limit_page_length: String(PAGE_SIZE),
						order_by: 'name asc'
					})
				);
				if (!Array.isArray(response.data)) throw new ERPNextGatewayError('invalid_response', false);
				for (const item of response.data) {
					if (!item || typeof item !== 'object')
						throw new ERPNextGatewayError('invalid_response', false);
					const row = item as JsonObject;
					const providerReferenceId = requiredString(row.name);
					result.push({
						referenceType: resource.referenceType,
						providerReferenceId,
						displayName: stringField(row[resource.nameField]) ?? providerReferenceId,
						company: stringField(row.company),
						disabled:
							resource.referenceType === 'currency'
								? !booleanField(row.enabled)
								: resource.referenceType === 'employee'
									? stringField(row.status)?.toLowerCase() !== 'active'
									: booleanField(row.disabled),
						currency: stringField(row.default_currency),
						email: stringField(row.user_id)?.toLowerCase(),
						providerModifiedAt: stringField(row.modified)
					});
				}
				if (response.data.length < PAGE_SIZE) break;
				if (page === MAX_ACCOUNT_PAGES - 1)
					throw new ERPNextGatewayError('response_too_large', false);
			}
		}
		return result;
	}

	async listOpenInvoices(
		type: ERPNextDocumentType,
		company: string
	): Promise<ERPNextOpenInvoice[]> {
		const normalizedCompany = requiredString(company);
		const doctype = type === 'purchaseInvoice' ? 'Purchase Invoice' : 'Sales Invoice';
		const partyField = type === 'purchaseInvoice' ? 'supplier' : 'customer';
		const partyNameField = type === 'purchaseInvoice' ? 'supplier_name' : 'customer_name';
		const fields = [
			'name',
			'company',
			partyField,
			partyNameField,
			'currency',
			'grand_total',
			'outstanding_amount',
			'posting_date',
			'due_date',
			'status',
			'modified'
		];
		const invoices: ERPNextOpenInvoice[] = [];
		for (let page = 0; page < MAX_ACCOUNT_PAGES; page += 1) {
			const response = await this.request(
				`/api/resource/${encodeURIComponent(doctype)}`,
				new URLSearchParams({
					fields: JSON.stringify(fields),
					filters: JSON.stringify([
						['company', '=', normalizedCompany],
						['docstatus', '=', 1],
						['outstanding_amount', '>', 0]
					]),
					limit_start: String(page * PAGE_SIZE),
					limit_page_length: String(PAGE_SIZE),
					order_by: 'due_date asc, name asc'
				})
			);
			if (!Array.isArray(response.data)) throw new ERPNextGatewayError('invalid_response', false);
			for (const item of response.data) {
				if (!item || typeof item !== 'object')
					throw new ERPNextGatewayError('invalid_response', false);
				const row = item as JsonObject;
				invoices.push({
					documentType: type,
					providerDocumentId: requiredString(row.name),
					company: requiredString(row.company),
					party: stringField(row[partyField]),
					partyName: stringField(row[partyNameField]),
					currency: requiredString(row.currency),
					grandTotal: decimalField(row.grand_total),
					outstandingAmount: decimalField(row.outstanding_amount),
					postingDate: stringField(row.posting_date),
					dueDate: stringField(row.due_date),
					status: requiredString(row.status),
					providerModifiedAt: stringField(row.modified)
				});
			}
			if (response.data.length < PAGE_SIZE) return invoices;
		}
		throw new ERPNextGatewayError('response_too_large', false);
	}

	async findPaymentByReference(
		reference: string,
		company: string
	): Promise<ERPNextPaymentEntry | null> {
		const normalizedReference = requiredString(reference);
		const response = await this.request(
			'/api/resource/Payment%20Entry',
			new URLSearchParams({
				fields: JSON.stringify(['name']),
				filters: JSON.stringify([
					['company', '=', requiredString(company)],
					['reference_no', '=', normalizedReference],
					['docstatus', '!=', 2]
				]),
				limit_page_length: '2'
			})
		);
		if (!Array.isArray(response.data)) throw new ERPNextGatewayError('invalid_response', false);
		if (response.data.length > 1) throw new ERPNextGatewayError('invalid_response', false);
		if (response.data.length === 0) return null;
		const candidate = response.data[0];
		if (!candidate || typeof candidate !== 'object')
			throw new ERPNextGatewayError('invalid_response', false);
		const providerDocumentId = requiredString((candidate as JsonObject).name);
		const document = await this.request(
			`/api/resource/Payment%20Entry/${encodeURIComponent(providerDocumentId)}`
		);
		return paymentEntry(document.data, normalizedReference);
	}

	async findDraftInvoiceByReference(
		type: ERPNextDocumentType,
		company: string,
		party: string,
		reference: string
	): Promise<ERPNextDraftInvoice | null> {
		const doctype = type === 'purchaseInvoice' ? 'Purchase Invoice' : 'Sales Invoice';
		const partyField = type === 'purchaseInvoice' ? 'supplier' : 'customer';
		const referenceField = type === 'purchaseInvoice' ? 'bill_no' : 'po_no';
		const response = await this.request(
			`/api/resource/${encodeURIComponent(doctype)}`,
			new URLSearchParams({
				fields: JSON.stringify(['name']),
				filters: JSON.stringify([
					['company', '=', requiredString(company)],
					[partyField, '=', requiredString(party)],
					[referenceField, '=', requiredString(reference)],
					['docstatus', '!=', 2]
				]),
				limit_page_length: '2'
			})
		);
		if (!Array.isArray(response.data)) throw new ERPNextGatewayError('invalid_response', false);
		if (response.data.length > 1) throw new ERPNextGatewayError('invalid_response', false);
		if (!response.data.length) return null;
		const candidate = response.data[0];
		if (!candidate || typeof candidate !== 'object')
			throw new ERPNextGatewayError('invalid_response', false);
		const providerDocumentId = requiredString((candidate as JsonObject).name);
		const document = await this.request(
			`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(providerDocumentId)}`
		);
		return draftInvoice(document.data, type, reference);
	}

	async createDraftInvoice(input: ERPNextDraftInvoiceInput): Promise<ERPNextDraftInvoice> {
		if (!input.items.length || input.items.length > 50)
			throw new ERPNextGatewayError('invalid_response', false);
		const isPurchase = input.documentType === 'purchaseInvoice';
		const doctype = isPurchase ? 'Purchase Invoice' : 'Sales Invoice';
		const response = await this.request(
			`/api/resource/${encodeURIComponent(doctype)}`,
			undefined,
			'POST',
			{
				doctype,
				company: requiredString(input.company),
				[isPurchase ? 'supplier' : 'customer']: requiredString(input.party),
				posting_date: requiredString(input.postingDate),
				due_date: requiredString(input.dueDate),
				currency: requiredString(input.currency),
				[isPurchase ? 'bill_no' : 'po_no']: requiredString(input.remoteReference),
				...(isPurchase ? { bill_date: requiredString(input.postingDate) } : {}),
				items: input.items.map((item) => ({
					item_code: requiredString(item.itemCode),
					description: requiredString(item.description),
					qty: decimalField(item.quantity),
					rate: decimalField(item.rate),
					[isPurchase ? 'expense_account' : 'income_account']: requiredString(item.account)
				}))
			}
		);
		const draft = draftInvoice(response.data, input.documentType, input.remoteReference);
		if (draft.docstatus !== 0) throw new ERPNextGatewayError('invalid_response', false);
		return draft;
	}

	async getSettlementInvoice(
		type: ERPNextDocumentType,
		providerDocumentId: string
	): Promise<ERPNextSettlementInvoice> {
		const doctype = type === 'purchaseInvoice' ? 'Purchase Invoice' : 'Sales Invoice';
		const partyField = type === 'purchaseInvoice' ? 'supplier' : 'customer';
		const accountField = type === 'purchaseInvoice' ? 'credit_to' : 'debit_to';
		const response = await this.request(
			`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(requiredString(providerDocumentId))}`
		);
		if (!response.data || typeof response.data !== 'object')
			throw new ERPNextGatewayError('invalid_response', false);
		const row = response.data as JsonObject;
		return {
			documentType: type,
			providerDocumentId: requiredString(row.name),
			company: requiredString(row.company),
			party: requiredString(row[partyField]),
			currency: requiredString(row.currency),
			outstandingAmount: decimalField(row.outstanding_amount),
			partyAccount: requiredString(row[accountField])
		};
	}

	async createPaymentEntry(input: ERPNextSettlementInput): Promise<ERPNextPaymentEntry> {
		const referenceDoctype =
			input.invoiceType === 'purchaseInvoice' ? 'Purchase Invoice' : 'Sales Invoice';
		const response = await this.request('/api/resource/Payment%20Entry', undefined, 'POST', {
			doctype: 'Payment Entry',
			payment_type: input.direction === 'pay' ? 'Pay' : 'Receive',
			company: requiredString(input.company),
			posting_date: requiredString(input.postingDate),
			party_type: input.direction === 'pay' ? 'Supplier' : 'Customer',
			party: requiredString(input.party),
			paid_from: requiredString(input.direction === 'pay' ? input.bankAccount : input.partyAccount),
			paid_to: requiredString(input.direction === 'pay' ? input.partyAccount : input.bankAccount),
			paid_amount: decimalField(input.amount),
			received_amount: decimalField(input.amount),
			reference_no: requiredString(input.remoteReference),
			reference_date: requiredString(input.postingDate),
			references: [
				{
					reference_doctype: referenceDoctype,
					reference_name: requiredString(input.invoiceId),
					allocated_amount: decimalField(input.amount)
				}
			]
		});
		return paymentEntry(response.data, input.remoteReference);
	}

	async submitPaymentEntry(payment: ERPNextPaymentEntry): Promise<ERPNextPaymentEntry> {
		if (payment.docstatus === 1) return payment;
		const document = await this.request(
			`/api/resource/Payment%20Entry/${encodeURIComponent(payment.providerDocumentId)}`
		);
		if (!document.data || typeof document.data !== 'object')
			throw new ERPNextGatewayError('invalid_response', false);
		const response = await this.request('/api/method/frappe.client.submit', undefined, 'POST', {
			doc: document.data as JsonObject
		});
		return paymentEntry(response.message, payment.remoteReference);
	}
}

export function createERPNextGateway(baseUrl: string, credentials: ERPNextCredentials) {
	return new LiveERPNextGateway(baseUrl, credentials);
}

export function erpNextErrorCode(error: unknown) {
	return error instanceof ERPNextGatewayError ? error.code : 'erpnext_request_failed';
}

export function erpNextErrorMessage(error: unknown) {
	return error instanceof ERPNextGatewayError ? error.message : 'ERPNext request failed.';
}

export function erpNextWriteMayBeAmbiguous(error: unknown) {
	return (
		!(error instanceof ERPNextGatewayError) ||
		error.retryable ||
		error.code === 'invalid_response' ||
		error.code === 'response_too_large'
	);
}
