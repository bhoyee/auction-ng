import { expect, it } from 'vitest';
import {
  parseStaffCsv,
  STAFF_CSV_HEADERS,
} from '../packages/shared/src/staff-csv';
const header = STAFF_CSV_HEADERS.join(',');
const row = (title = 'Demo phone', price = '50000') =>
  `${title},Accurate item notes,new,1000000,${price},00000000-0000-4000-8000-000000000001,00000000-0000-4000-8000-000000000002,2026-12-01T10:00:00.000Z,2026-12-02T10:00:00.000Z`;
it('parses quoted commas, escaped quotes and multiline descriptions without changing kobo', () => {
  const rows = parseStaffCsv(
    header +
      '\n' +
      row('"Phone, ""Pro"""').replace(
        'Accurate item notes',
        '"Line one\nLine two"',
      ),
  );
  expect(rows[0]).toMatchObject({
    title: 'Phone, "Pro"',
    description: 'Line one\nLine two',
    startPriceKobo: 50000,
  });
});
it('rejects fractional, unsafe and negative monetary input', () => {
  for (const amount of ['1.5', '-100', '9007199254740992', 'NaN'])
    expect(() => parseStaffCsv(header + '\n' + row('Phone', amount))).toThrow();
});
it('bounds batches and requires the exact template', () => {
  expect(
    parseStaffCsv(
      header + '\n' + Array.from({ length: 50 }, () => row()).join('\n'),
    ),
  ).toHaveLength(50);
  expect(() =>
    parseStaffCsv(
      header + '\n' + Array.from({ length: 51 }, () => row()).join('\n'),
    ),
  ).toThrow();
  expect(() => parseStaffCsv('unknown,' + header + '\n' + row())).toThrow();
  expect(() => parseStaffCsv(header + '\n' + row('"unfinished'))).toThrow();
});
it('rejects invalid dates and reversed auction windows', () => {
  expect(() =>
    parseStaffCsv(header + '\n' + row().replace('2026-12-02', '2026-11-30')),
  ).toThrow();
});
