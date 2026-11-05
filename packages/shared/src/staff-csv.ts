import { createLotInputSchema, type CreateLotInput } from './catalogue-schemas';
export const STAFF_CSV_HEADERS = [
  'title',
  'description',
  'condition',
  'retailPriceKobo',
  'startPriceKobo',
  'categoryId',
  'locationId',
  'startsAt',
  'endsAt',
] as const;
/** RFC-style quoted fields with strict bounded rows and explicit integer-kobo prices. */
export function parseStaffCsv(text: string): CreateLotInput[] {
  if (text.length > 1_000_000) throw Error('CSV must be smaller than 1 MB.');
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted || field === '') quoted = !quoted;
      else throw Error('Invalid CSV quote.');
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(field.replace(/\r$/, ''));
      field = '';
      if (char === '\n') {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else field += char;
    if (rows.length > 51) throw Error('Import at most 50 lots at a time.');
  }
  if (quoted) throw Error('CSV contains an unfinished quoted field.');
  row.push(field.replace(/\r$/, ''));
  if (row.some(Boolean)) rows.push(row);
  const header = rows.shift()?.map((s) => s.replace(/^\uFEFF/, '').trim());
  if (!header || header.join(',') !== STAFF_CSV_HEADERS.join(','))
    throw Error('Use the provided CSV template and keep its column headings.');
  if (!rows.length || rows.length > 50)
    throw Error('Import between 1 and 50 lots.');
  return rows.map((values, index) => {
    if (values.length !== header.length)
      throw Error(`Row ${index + 2}: wrong number of columns.`);
    const record = Object.fromEntries(header.map((key, i) => [key, values[i]]));
    for (const key of ['retailPriceKobo', 'startPriceKobo']) {
      if (!/^\d+$/.test(String(record[key])))
        throw Error(`Row ${index + 2}: prices must be whole kobo amounts.`);
    }
    const result = createLotInputSchema.safeParse({
      ...record,
      retailPriceKobo: Number(record.retailPriceKobo),
      startPriceKobo: Number(record.startPriceKobo),
    });
    if (!result.success)
      throw Error(
        `Row ${index + 2}: check the item, condition, prices, category, location and dates.`,
      );
    return result.data;
  });
}
