import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import {
  DEFAULT_INVOICE_TERMS,
  formatNaira,
  type CompanyDetails,
} from '@auction-ng/shared';

// The invoice and combined receipt PDFs (A4). Recorded amounts only: nothing
// is worked out here.
const COLOUR = {
  indigo: '#1C2A6B',
  ink: '#14182B',
  slate: '#5B6478',
  line: '#E2E5EC',
  canvas: '#F4F5F9',
  green: '#127A55',
  amber: '#9A5B00',
  yellow: '#FFC629',
  pale: '#FFF8E1',
};
const PAGE = { width: 595.28, height: 841.89, margin: 42 };
const RIGHT = PAGE.width - PAGE.margin;
const INNER = RIGHT - PAGE.margin;

function font(name: 'regular' | 'bold') {
  const file = `packages/ui/fonts/invoice-${name}.ttf`;
  for (const base of [process.cwd(), resolve(process.cwd(), '../..')]) {
    const path = resolve(base, file);
    if (existsSync(path)) return path;
  }
  throw new Error('Invoice font is missing.');
}
void fileURLToPath;

const day = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Lagos',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const date = (value: Date) => day.format(value).replace(',', '');
/** Always two decimals, so the columns line up. */
const money = (kobo: number) => {
  const text = formatNaira(Math.abs(kobo));
  const full = text.includes('.') ? text : text + '.00';
  return (kobo < 0 ? '−' : '') + full;
};
const percent = (bps: number | null) =>
  bps === null ? '' : ` (${String(bps / 100)}%)`;

export type InvoicePdfData = {
  number: string;
  status: string;
  stamp: 'PAID' | 'PARTLY REFUNDED' | 'REFUNDED' | 'CANCELLED' | 'PROCESSING';
  fixedPrice: boolean;
  issuedAt: Date;
  paidAt: Date | null;
  buyer: { name: string; phone: string | null; email: string | null };
  pickup: {
    name: string;
    address: string;
    dueAt: Date | null;
    dailyKobo: number | null;
    collectedAt: Date | null;
    open: boolean;
  } | null;
  premiumBps: number | null;
  vatBps: number | null;
  lines: {
    title: string;
    lotNumber: string;
    hammerKobo: number;
    premiumKobo: number;
    lotFeeKobo: number;
    vatKobo: number;
    totalKobo: number;
  }[];
  hammerKobo: number;
  premiumKobo: number;
  lotFeeKobo: number;
  vatKobo: number;
  totalKobo: number;
  paidKobo: number;
  refunds: { at: Date; amountKobo: number }[];
};
export type ReceiptPdfData = {
  buyer: { name: string; email: string | null };
  from: Date;
  to: Date;
  invoices: {
    number: string;
    paidAt: Date;
    items: string;
    hammerKobo: number;
    feesKobo: number;
    totalKobo: number;
    refundedKobo: number;
  }[];
};

type Doc = InstanceType<typeof PDFDocument>;
function start(title: string) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 0, bottom: 0, left: PAGE.margin, right: PAGE.margin },
    bufferPages: true,
    info: { Title: title, Author: 'GiddyDeal' },
  });
  doc.registerFont('regular', font('regular'));
  doc.registerFont('bold', font('bold'));
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((res, reject) => {
    doc.on('end', () => res(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  return { doc, done };
}
function put(
  doc: Doc,
  text: string,
  x: number,
  y: number,
  o: {
    size?: number;
    bold?: boolean;
    colour?: string;
    width?: number;
    align?: 'left' | 'right';
    lines?: number;
  } = {},
) {
  doc
    .font(o.bold ? 'bold' : 'regular')
    .fontSize(o.size ?? 9.5)
    .fillColor(o.colour ?? COLOUR.ink);
  const width = o.width ?? RIGHT - x;
  const height = doc.currentLineHeight() * (o.lines ?? 1) + 1;
  doc.text(text, x, y, {
    width,
    align: o.align ?? 'left',
    lineBreak: (o.lines ?? 1) > 1,
    ellipsis: true,
    ...((o.lines ?? 1) > 1 ? { height } : {}),
  });
  return y + height;
}
const rule = (doc: Doc, y: number, colour = COLOUR.line, width = 0.75) =>
  doc
    .moveTo(PAGE.margin, y)
    .lineTo(RIGHT, y)
    .lineWidth(width)
    .strokeColor(colour)
    .stroke();
const topBar = (doc: Doc) => doc.rect(0, 0, PAGE.width, 6).fill(COLOUR.indigo);

function header(
  doc: Doc,
  company: CompanyDetails,
  title: string,
  reference: string,
  stamp?: { text: string; colour: string },
) {
  topBar(doc);
  put(doc, company.name, PAGE.margin, 44, { size: 20, bold: true, width: 300 });
  const nameWidth = doc.font('bold').fontSize(20).widthOfString(company.name);
  doc
    .circle(PAGE.margin + Math.min(nameWidth, 290) + 10, 57, 3.5)
    .fill(COLOUR.yellow);
  // Blank details are left off.
  const block = [
    company.parent,
    [
      company.rcNumber && `RC ${company.rcNumber}`,
      company.tin && `TIN ${company.tin}`,
    ]
      .filter(Boolean)
      .join(' · '),
    company.address,
    [company.email, company.phone, company.website].filter(Boolean).join(' · '),
  ].filter(Boolean);
  let y = 72;
  for (const line of block) {
    put(doc, line, PAGE.margin, y, {
      size: 8.5,
      colour: COLOUR.slate,
      width: 320,
    });
    y += 12.5;
  }
  put(doc, title, 300, 44, {
    size: 22,
    bold: true,
    align: 'right',
    width: RIGHT - 300,
  });
  put(doc, reference, 300, 72, {
    size: 10.5,
    bold: true,
    colour: COLOUR.indigo,
    align: 'right',
    width: RIGHT - 300,
  });
  let bottom = Math.max(y, 92);
  if (stamp) {
    doc.font('bold').fontSize(10);
    const width = doc.widthOfString(stamp.text) + 22;
    doc
      .roundedRect(RIGHT - width, 90, width, 21, 4)
      .lineWidth(1.4)
      .strokeColor(stamp.colour)
      .stroke();
    put(doc, stamp.text, RIGHT - width + 11, 95, {
      size: 10,
      bold: true,
      colour: stamp.colour,
      width: width - 10,
    });
    bottom = Math.max(bottom, 118);
  }
  rule(doc, bottom + 12);
  return bottom + 12;
}
function footers(doc: Doc, company: CompanyDetails) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    rule(doc, PAGE.height - 66);
    put(
      doc,
      company.terms || DEFAULT_INVOICE_TERMS,
      PAGE.margin,
      PAGE.height - 56,
      { size: 7.5, colour: COLOUR.slate, width: INNER - 80, lines: 3 },
    );
    put(doc, `Page ${i + 1} of ${range.count}`, RIGHT - 70, PAGE.height - 56, {
      size: 7.5,
      colour: COLOUR.slate,
      width: 70,
      align: 'right',
    });
  }
}
const BOTTOM = PAGE.height - 84;

type Column = { label: string; x: number; width: number; right?: boolean };
function tableHead(doc: Doc, columns: Column[], y: number) {
  for (const c of columns)
    put(doc, c.label, c.x, y, {
      size: 8,
      bold: true,
      colour: COLOUR.slate,
      width: c.width,
      align: c.right ? 'right' : 'left',
    });
  rule(doc, y + 15, COLOUR.ink, 1.4);
  return y + 15;
}
function totals(
  doc: Doc,
  rows: { label: string; value: string; bold?: boolean; colour?: string }[],
  y: number,
) {
  const x = 328;
  for (const row of rows) {
    if (row.bold) {
      doc
        .moveTo(x, y)
        .lineTo(RIGHT, y)
        .lineWidth(1.4)
        .strokeColor(COLOUR.ink)
        .stroke();
      y += 7;
    }
    const size = row.bold ? 12 : 9.5;
    put(doc, row.label, x, y, {
      size,
      bold: !!row.bold || !!row.colour,
      colour: row.colour,
      width: 150,
    });
    put(doc, row.value, x + 110, y, {
      size,
      bold: !!row.bold || !!row.colour,
      colour: row.colour,
      width: RIGHT - x - 110,
      align: 'right',
    });
    y += row.bold ? 22 : 19;
  }
  return y;
}

export function invoicePdf(data: InvoicePdfData, company: CompanyDetails) {
  const { doc, done } = start(`Invoice ${data.number}`);
  const stampColour = {
    PAID: COLOUR.green,
    'PARTLY REFUNDED': COLOUR.amber,
    REFUNDED: COLOUR.slate,
    CANCELLED: COLOUR.slate,
    PROCESSING: COLOUR.amber,
  }[data.stamp];
  let y = header(doc, company, 'Invoice', data.number, {
    text: data.stamp,
    colour: stampColour,
  });
  const label = (text: string, x: number, at: number) =>
    put(doc, text, x, at, {
      size: 8,
      bold: true,
      colour: COLOUR.slate,
      width: 160,
    });
  const top = y + 14;
  label('Billed to', PAGE.margin, top);
  put(doc, data.buyer.name, PAGE.margin, top + 15, {
    size: 10.5,
    bold: true,
    width: 190,
  });
  let left = top + 30;
  for (const value of [data.buyer.phone, data.buyer.email]) {
    if (!value) continue;
    put(doc, value, PAGE.margin, left, { size: 9, width: 190 });
    left += 13;
  }
  label('Invoice date', 247, top);
  put(doc, date(data.issuedAt), 247, top + 15, { bold: true, width: 140 });
  if (data.paidAt) {
    label('Paid on', 247, top + 36);
    put(doc, date(data.paidAt), 247, top + 51, { bold: true, width: 140 });
  }
  if (data.pickup) {
    label('Collect from', 408, top);
    put(doc, data.pickup.name, 408, top + 15, { bold: true, width: 145 });
    put(doc, data.pickup.address, 408, top + 29, {
      size: 8.5,
      width: 145,
      lines: 2,
    });
    put(
      doc,
      data.pickup.collectedAt
        ? `Collected ${date(data.pickup.collectedAt)}`
        : data.pickup.dueAt
          ? `Free until ${date(data.pickup.dueAt)}`
          : 'We’ll tell you when it’s ready',
      408,
      top + 53,
      { size: 8.5, colour: COLOUR.slate, width: 145 },
    );
  }
  y = Math.max(left, top + 70) + 10;
  rule(doc, y);

  const columns: Column[] = data.fixedPrice
    ? [
        { label: 'Item', x: PAGE.margin + 4, width: 250 },
        { label: 'Price', x: 300, width: 80, right: true },
        { label: `Tax${percent(data.vatBps)}`, x: 385, width: 75, right: true },
        { label: 'Total', x: 465, width: RIGHT - 469, right: true },
      ]
    : [
        { label: 'Lot', x: PAGE.margin + 4, width: 172 },
        { label: 'Hammer', x: 218, width: 72, right: true },
        {
          label: `Premium${percent(data.premiumBps)}`,
          x: 292,
          width: 76,
          right: true,
        },
        { label: 'Lot fee', x: 370, width: 46, right: true },
        { label: `VAT${percent(data.vatBps)}`, x: 418, width: 56, right: true },
        { label: 'Total', x: 474, width: RIGHT - 478, right: true },
      ];
  y = tableHead(doc, columns, y + 16);
  for (const line of data.lines) {
    if (y + 27 > BOTTOM) {
      doc.addPage();
      topBar(doc);
      y = tableHead(doc, columns, 36);
    }
    const values = data.fixedPrice
      ? [line.hammerKobo, line.vatKobo, line.totalKobo]
      : [
          line.hammerKobo,
          line.premiumKobo,
          line.lotFeeKobo,
          line.vatKobo,
          line.totalKobo,
        ];
    put(doc, line.title, PAGE.margin + 4, y + 5, {
      size: 9,
      bold: true,
      width: columns[0]?.width ?? 172,
    });
    put(doc, line.lotNumber, PAGE.margin + 4, y + 16, {
      size: 8,
      colour: COLOUR.slate,
      width: 172,
    });
    values.forEach((value, i) => {
      const c = columns[i + 1];
      if (c)
        put(doc, money(value), c.x, y + 10, {
          size: 8.8,
          bold: i === values.length - 1,
          width: c.width,
          align: 'right',
        });
    });
    y += 27;
    rule(doc, y);
  }

  const refunded = data.refunds.reduce((s, r) => s + r.amountKobo, 0);
  const rows = [
    {
      label: data.fixedPrice ? 'Item price' : 'Hammer total',
      value: money(data.hammerKobo),
    },
    ...(data.fixedPrice
      ? []
      : [
          {
            label: `Buyer’s premium${percent(data.premiumBps)}`,
            value: money(data.premiumKobo),
          },
          {
            label:
              data.lines.length === 1
                ? 'Lot fee'
                : `Lot fees (${data.lines.length})`,
            value: money(data.lotFeeKobo),
          },
        ]),
    {
      label: data.fixedPrice
        ? `Tax${percent(data.vatBps)}`
        : `VAT on fees${percent(data.vatBps)}`,
      value: money(data.vatKobo),
    },
    { label: 'Total', value: money(data.totalKobo), bold: true },
    ...(data.paidKobo
      ? [
          {
            label: 'Paid from GiddyDeal wallet',
            value: money(-data.paidKobo),
            colour: COLOUR.green,
          },
        ]
      : []),
    ...data.refunds.map((r) => ({
      label: `Refunded to wallet, ${date(r.at).replace(/ \d{4}$/, '')}`,
      value: money(-r.amountKobo),
      colour: COLOUR.slate,
    })),
  ];
  const needed = rows.length * 20 + 50;
  if (y + needed > BOTTOM) {
    doc.addPage();
    topBar(doc);
    y = 30;
  }
  y = totals(doc, rows, y + 18);
  doc.roundedRect(328, y, RIGHT - 328, 25, 4).fill(COLOUR.canvas);
  const due =
    data.status === 'cancelled' || data.paidKobo
      ? 0
      : data.totalKobo - refunded;
  put(doc, 'Balance due', 336, y + 7, { bold: true, width: 100 });
  put(doc, money(due), 436, y + 7, {
    bold: true,
    width: RIGHT - 444,
    align: 'right',
  });
  y += 40;

  if (data.pickup?.open) {
    if (y + 92 > BOTTOM) {
      doc.addPage();
      topBar(doc);
      y = 30;
    }
    doc
      .roundedRect(PAGE.margin, y, INNER, 88, 8)
      .fillAndStroke(COLOUR.pale, '#F0DC97');
    // The invoice number only. Collecting still needs the buyer's private
    // pass and ID, so a copied PDF can't collect goods.
    const qr = QRCode.create(data.number, { errorCorrectionLevel: 'M' });
    const cell = 66 / qr.modules.size;
    doc.roundedRect(PAGE.margin + 11, y + 11, 66, 66, 3).fill('#FFFFFF');
    for (let r = 0; r < qr.modules.size; r++)
      for (let c = 0; c < qr.modules.size; c++)
        if (qr.modules.get(r, c))
          doc
            .rect(
              PAGE.margin + 11 + c * cell * 0.9 + 3.3,
              y + 11 + r * cell * 0.9 + 3.3,
              cell * 0.9 + 0.05,
              cell * 0.9 + 0.05,
            )
            .fill(COLOUR.ink);
    put(doc, `Pickup · ${data.number}`, PAGE.margin + 92, y + 14, {
      size: 11,
      bold: true,
      width: INNER - 104,
    });
    put(
      doc,
      `Staff use this number to find your order. Bring the pickup pass from your account and an ID that matches the name above. Check your items before you leave and tell staff at once if anything is wrong.${data.pickup.dueAt && data.pickup.dailyKobo ? ` Items not collected by ${date(data.pickup.dueAt)} are charged ${formatNaira(data.pickup.dailyKobo)} per working day.` : ''}`,
      PAGE.margin + 92,
      y + 31,
      { size: 8.8, width: INNER - 104, lines: 4 },
    );
  }
  footers(doc, company);
  doc.end();
  return done;
}

export function receiptPdf(data: ReceiptPdfData, company: CompanyDetails) {
  const { doc, done } = start('Receipt');
  const sameDay = date(data.from) === date(data.to);
  let y = header(
    doc,
    company,
    'Receipt',
    sameDay ? date(data.from) : `${date(data.from)} to ${date(data.to)}`,
  );
  put(doc, 'Paid by', PAGE.margin, y + 14, {
    size: 8,
    bold: true,
    colour: COLOUR.slate,
  });
  put(doc, data.buyer.name, PAGE.margin, y + 29, { size: 10.5, bold: true });
  if (data.buyer.email)
    put(doc, data.buyer.email, PAGE.margin, y + 44, { size: 9 });
  y += 64;
  rule(doc, y);
  const columns: Column[] = [
    { label: 'Item', x: PAGE.margin + 4, width: 170 },
    { label: 'Invoice', x: 216, width: 92 },
    { label: 'Hammer', x: 306, width: 74, right: true },
    { label: 'Fees + VAT', x: 382, width: 76, right: true },
    { label: 'Total', x: 460, width: RIGHT - 464, right: true },
  ];
  y = tableHead(doc, columns, y + 16);
  for (const row of data.invoices) {
    if (y + 27 > BOTTOM) {
      doc.addPage();
      topBar(doc);
      y = tableHead(doc, columns, 36);
    }
    put(doc, row.items, PAGE.margin + 4, y + 5, {
      size: 9,
      bold: true,
      width: 168,
    });
    put(
      doc,
      `Paid ${date(row.paidAt)}${row.refundedKobo ? ` · refunded ${money(row.refundedKobo)}` : ''}`,
      PAGE.margin + 4,
      y + 16,
      { size: 8, colour: COLOUR.slate, width: 210 },
    );
    put(doc, row.number, 216, y + 5, { size: 8.8, width: 92 });
    for (const [i, value] of [
      row.hammerKobo,
      row.feesKobo,
      row.totalKobo,
    ].entries()) {
      const c = columns[i + 2];
      if (c)
        put(doc, money(value), c.x, y + 10, {
          size: 8.8,
          bold: i === 2,
          width: c.width,
          align: 'right',
        });
    }
    y += 27;
    rule(doc, y);
  }
  const sum = (pick: (r: ReceiptPdfData['invoices'][number]) => number) =>
    data.invoices.reduce((s, r) => s + pick(r), 0);
  const paid = sum((r) => r.totalKobo);
  const refunded = sum((r) => r.refundedKobo);
  if (y + 140 > BOTTOM) {
    doc.addPage();
    topBar(doc);
    y = 30;
  }
  y = totals(
    doc,
    [
      { label: 'Hammer total', value: money(sum((r) => r.hammerKobo)) },
      { label: 'Fees and VAT', value: money(sum((r) => r.feesKobo)) },
      { label: 'Total paid', value: money(paid), bold: true },
      ...(refunded
        ? [
            {
              label: 'Refunded to wallet',
              value: money(-refunded),
              colour: COLOUR.slate,
            },
            { label: 'Net paid', value: money(paid - refunded), bold: true },
          ]
        : []),
    ],
    y + 18,
  );
  put(
    doc,
    `${data.invoices.length} ${data.invoices.length === 1 ? 'purchase' : 'purchases'}. This receipt lists paid invoices; each invoice is the official record.`,
    PAGE.margin,
    y + 10,
    { size: 8.5, colour: COLOUR.slate, lines: 2 },
  );
  footers(doc, company);
  doc.end();
  return done;
}
