import { databaseValues } from './database-values';
import {
  LOT_CSV_MAX_ROWS,
  LOT_DEFAULT_RUN_TIME_MINUTES,
  LOT_RUN_TIME_MAX_MINUTES,
  LOT_RUN_TIME_MIN_MINUTES,
  LOT_TAG_MAX,
  LOT_TITLE_MAX,
  type LotForm,
} from './lots-admin';

// Lots CSV import (T15e): one template per category, prices in Naira, a
// row/field/problem report in plain words, and only the good rows imported.

export const LOT_CSV_MAX_BYTES = 4_000_000;
export const LOT_CSV_BASE_COLUMNS = [
  'title',
  'description',
  'condition',
  'start_price',
  'retail_price',
  'run_time_hours',
  'pickup_location_code',
  'bin',
  'supplier',
  'brand',
  'included',
  'defects',
] as const;
const DETAIL_PREFIX = 'detail:';

export type LotCsvField = {
  key: string;
  name: string;
  type: 'text' | 'list' | 'number' | 'boolean';
  required: boolean;
  options: string[];
};
export type LotCsvContext = {
  categoryId: string;
  fields: LotCsvField[];
  allowedConditions: readonly string[];
  /** Pickup location code (upper case) → id, for open locations. */
  locations: Map<string, string>;
  /** `${locationId}:${binCode upper}` → bin id. */
  bins: Map<string, string>;
  /** Lower-cased name → id. */
  suppliers: Map<string, string>;
  brands: Map<string, string>;
};
export type LotCsvProblem = { row: number; field: string; problem: string };
export type LotCsvResult = {
  good: { row: number; lot: LotForm }[];
  problems: LotCsvProblem[];
  rows: number;
};

export function lotCsvHeaders(fields: Pick<LotCsvField, 'key'>[]): string[] {
  return [...LOT_CSV_BASE_COLUMNS, ...fields.map((f) => DETAIL_PREFIX + f.key)];
}

const conditionByLabel: Record<string, string> = {
  new: 'new',
  'like new': 'like_new',
  like_new: 'like_new',
  'open box': 'open_box',
  open_box: 'open_box',
  damaged: 'damaged',
  untested: 'untested',
};

/** RFC 4180 fields; throws a plain-words error for a broken file. */
export function tokenizeCsv(text: string, maxRows = LOT_CSV_MAX_ROWS + 1) {
  if (text.length > LOT_CSV_MAX_BYTES)
    throw new Error('The file is too large. Keep it under 4 MB.');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted || field === '') quoted = !quoted;
      else
        throw new Error(
          `A quote is in the wrong place on line ${rows.length + 1}.`,
        );
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(field.replace(/\r$/, ''));
      field = '';
      if (char === '\n') {
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
        if (rows.length > maxRows)
          throw new Error(
            `Import at most ${LOT_CSV_MAX_ROWS.toLocaleString('en-NG')} lots at a time.`,
          );
      }
    } else field += char;
  }
  if (quoted) throw new Error('The file ends inside a quoted value.');
  row.push(field.replace(/\r$/, ''));
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

/** "₦12,500", "12500" or "12,500.50" → kobo; null when not a price. */
export function nairaToKobo(value: string): number | null {
  const clean = value.replace(/[₦,\s]/g, '');
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(clean);
  if (!match) return null;
  const kobo = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(kobo) ? kobo : null;
}

const tags = (value: string) =>
  value
    .split('|')
    .map((v) => v.trim())
    .filter(Boolean);

export function validateLotCsv(text: string, ctx: LotCsvContext): LotCsvResult {
  const rows = tokenizeCsv(text);
  // trim() also drops the byte-order mark Excel adds to UTF-8 files.
  const header = rows.shift()?.map((h) => h.trim());
  const expected = lotCsvHeaders(ctx.fields);
  if (!header || header.join(',') !== expected.join(','))
    throw new Error(
      'The columns don’t match this category’s template. Download the template again and keep its headings.',
    );
  if (!rows.length) throw new Error('The file has no lots in it.');
  const good: LotCsvResult['good'] = [];
  const problems: LotCsvProblem[] = [];
  rows.forEach((values, index) => {
    const row = index + 2; // spreadsheet row, after the heading row
    const issues: LotCsvProblem[] = [];
    const bad = (field: string, problem: string) =>
      issues.push({ row, field, problem });
    if (values.length !== header.length) {
      problems.push({
        row,
        field: 'row',
        problem: `Has ${values.length} columns; the template has ${header.length}.`,
      });
      return;
    }
    const cell = (key: string) => (values[header.indexOf(key)] ?? '').trim();
    const title = cell('title');
    if (!title) bad('title', 'Add a title.');
    else if (title.length > LOT_TITLE_MAX)
      bad('title', `Shorten the title to ${LOT_TITLE_MAX} characters.`);
    const description = cell('description');
    if (!description) bad('description', 'Add a description.');
    const condition = conditionByLabel[cell('condition').toLowerCase()];
    if (!condition)
      bad('condition', 'Use New, Like new, Open box, Damaged or Untested.');
    else if (!ctx.allowedConditions.includes(condition))
      bad('condition', 'This category doesn’t allow that condition.');
    const start = nairaToKobo(cell('start_price'));
    if (!start)
      bad('start_price', 'Enter the start price in Naira, e.g. 5000.');
    const retail = nairaToKobo(cell('retail_price'));
    if (retail === null)
      bad('retail_price', 'Enter the retail price in Naira, e.g. 215000.');
    const hoursText = cell('run_time_hours');
    const runTimeMinutes = hoursText
      ? Number(hoursText) * 60
      : LOT_DEFAULT_RUN_TIME_MINUTES;
    if (
      !Number.isInteger(runTimeMinutes) ||
      runTimeMinutes < LOT_RUN_TIME_MIN_MINUTES ||
      runTimeMinutes > LOT_RUN_TIME_MAX_MINUTES
    )
      bad('run_time_hours', 'Use whole hours from 1 to 168.');
    const locationId = ctx.locations.get(
      cell('pickup_location_code').toUpperCase(),
    );
    if (!locationId)
      bad(
        'pickup_location_code',
        'Use the 3-letter code of an open pickup location.',
      );
    let binId: string | null = null;
    if (cell('bin') && locationId) {
      binId =
        ctx.bins.get(`${locationId}:${cell('bin').toUpperCase()}`) ?? null;
      if (!binId) bad('bin', 'No bin with this name at that location.');
    }
    let supplierId: string | null = null;
    if (cell('supplier')) {
      supplierId = ctx.suppliers.get(cell('supplier').toLowerCase()) ?? null;
      if (!supplierId) bad('supplier', 'Add this supplier in Lot setup first.');
    }
    let brandId: string | null = null;
    if (cell('brand')) {
      brandId = ctx.brands.get(cell('brand').toLowerCase()) ?? null;
      if (!brandId) bad('brand', 'Add this brand in Lot setup first.');
    }
    const included = tags(cell('included'));
    const defects = tags(cell('defects'));
    if (included.length > LOT_TAG_MAX || defects.length > LOT_TAG_MAX)
      bad('included', `List at most ${LOT_TAG_MAX} items, separated by |.`);
    const details: Record<string, string | number | boolean> = {};
    for (const field of ctx.fields) {
      const raw = cell(DETAIL_PREFIX + field.key);
      const column = DETAIL_PREFIX + field.key;
      if (!raw) {
        if (field.required) bad(column, `Fill in ${field.name}.`);
        continue;
      }
      if (field.type === 'number') {
        const n = Number(raw.replace(/,/g, ''));
        if (!Number.isFinite(n)) bad(column, `${field.name} must be a number.`);
        else details[field.key] = n;
      } else if (field.type === 'boolean') {
        const yes = ['yes', 'y', 'true'].includes(raw.toLowerCase());
        const no = ['no', 'n', 'false'].includes(raw.toLowerCase());
        if (!yes && !no) bad(column, `${field.name} must be Yes or No.`);
        else details[field.key] = yes;
      } else if (field.type === 'list') {
        const option = field.options.find(
          (o) => o.toLowerCase() === raw.toLowerCase(),
        );
        if (!option)
          bad(
            column,
            `${field.name} must be one of: ${field.options.join(', ')}.`,
          );
        else details[field.key] = option;
      } else if (raw.length > 200)
        bad(column, `Shorten ${field.name} to 200 characters.`);
      else details[field.key] = raw;
    }
    if (issues.length) {
      problems.push(...issues);
      return;
    }
    good.push({
      row,
      lot: {
        title,
        description,
        condition: condition as (typeof databaseValues.lotConditions)[number],
        categoryId: ctx.categoryId,
        locationId: locationId ?? '',
        binId,
        brandId,
        supplierId,
        startPriceKobo: start ?? 0,
        retailPriceKobo: retail ?? 0,
        runTimeMinutes,
        details,
        included,
        defects,
      },
    });
  });
  return { good, problems, rows: rows.length };
}
