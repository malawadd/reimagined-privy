export type CsvRecord = { sourceRow: number; values: Record<string, string> };

export function parseCsvRecords(text: string): CsvRecord[] {
	const rows = parseRows(text.replace(/^\uFEFF/, ''));
	if (rows.length < 2) throw new Error('CSV must include a header and at least one data row.');
	const headers = rows[0].map((value) => value.trim().toLowerCase().replace(/\s+/g, '_'));
	if (headers.some((header) => !header)) throw new Error('CSV headers cannot be blank.');
	if (new Set(headers).size !== headers.length) throw new Error('CSV headers must be unique.');
	return rows.slice(1).flatMap((row, index) => {
		if (row.every((value) => !value.trim())) return [];
		if (row.length > headers.length) throw new Error(`CSV row ${index + 2} has too many columns.`);
		return [
			{
				sourceRow: index + 2,
				values: Object.fromEntries(
					headers.map((header, column) => [header, row[column]?.trim() ?? ''])
				)
			}
		];
	});
}

function parseRows(text: string) {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];
		if (character === '"') {
			if (quoted && text[index + 1] === '"') {
				field += '"';
				index += 1;
			} else quoted = !quoted;
			continue;
		}
		if (character === ',' && !quoted) {
			row.push(field);
			field = '';
			continue;
		}
		if ((character === '\n' || character === '\r') && !quoted) {
			if (character === '\r' && text[index + 1] === '\n') index += 1;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
			continue;
		}
		field += character;
	}
	if (quoted) throw new Error('CSV contains an unterminated quoted field.');
	if (field || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}
