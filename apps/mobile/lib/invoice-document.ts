import type { buyerInvoiceDetailSchema } from '@auction-ng/shared/buyer-schemas';
import { formatNaira } from '@auction-ng/shared/money';
import { tokens as t } from '@auction-ng/ui';

export type InvoiceDocument = ReturnType<typeof buyerInvoiceDetailSchema.parse>;
export function invoiceSummary(item: InvoiceDocument) {
  return [
    { label: 'Item subtotal', amount: item.hammerTotalKobo },
    ...(item.premiumKobo
      ? [{ label: 'Service charge', amount: item.premiumKobo }]
      : []),
    ...(item.lotFeeKobo ? [{ label: 'Lot fee', amount: item.lotFeeKobo }] : []),
    ...(item.vatKobo ? [{ label: 'Tax', amount: item.vatKobo }] : []),
  ];
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? '',
  );

export function invoiceDocument(item: InvoiceDocument, buyerName: string) {
  const date = new Date(item.createdAt).toLocaleDateString('en-NG', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const totalLabel = item.status === 'paid' ? 'Total paid' : 'Invoice total';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(item.number)}</title><style>
  @page{margin:24mm}body{font-family:'${t.fontFamily}',sans-serif;font-size:14px;line-height:1.5;color:${t.colors.ink}}
  header{display:flex;justify-content:space-between;align-items:start;border-bottom:3px solid ${t.colors['indigo-900']};padding-bottom:20px}
  h1{color:${t.colors['indigo-900']};margin:0;font-size:30px}h2{font-size:18px;margin:24px 0 12px}p{margin:4px 0}.right{text-align:right}
  .muted{color:${t.colors['slate-600']}}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{padding:12px 0;text-align:left;border-bottom:1px solid ${t.colors.line};vertical-align:top}th{color:${t.colors['slate-600']};font-size:12px}
  tr{break-inside:avoid}.summary{margin-left:auto;width:65%}.summary td:last-child{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .total{font-weight:700;font-size:20px;color:${t.colors['indigo-900']}}footer{margin-top:32px;padding-top:16px;border-top:1px solid ${t.colors.line};color:${t.colors['slate-600']};font-size:12px}
  </style></head><body><header><div><h1>LotVanta</h1><p class="muted">Invoice</p></div><div class="right"><h2>${escapeHtml(item.number)}</h2><p>${escapeHtml(item.status.toUpperCase())}</p></div></header>
  <h2>Billed to</h2><p>${escapeHtml(buyerName)}</p><table><tr><td>Invoice date</td><td class="right">${escapeHtml(date)} (WAT)</td></tr><tr><td>Order type</td><td class="right">${item.saleType === 'fixed_price' ? 'Buy Now purchase' : 'Auction win'}</td></tr><tr><td>Currency</td><td class="right">NGN — Nigerian Naira</td></tr></table>
  <h2>Items</h2><table><thead><tr><th>Item</th><th class="right">Line total</th></tr></thead><tbody>${item.lines.map((line) => `<tr><td><strong>${escapeHtml(line.lot.title)}</strong><p class="muted">Item ${escapeHtml(line.lot.lotNumber)}</p></td><td class="right">${escapeHtml(formatNaira(line.totalKobo))}</td></tr>`).join('')}</tbody></table>
  <table class="summary">${invoiceSummary(item)
    .map(
      (row) =>
        `<tr><td>${row.label}</td><td>${escapeHtml(formatNaira(row.amount))}</td></tr>`,
    )
    .join(
      '',
    )}<tr class="total"><td>${totalLabel}</td><td>${escapeHtml(formatNaira(item.totalKobo))}</td></tr></table>
  <h2>Pickup location</h2><p>${escapeHtml(item.pickup?.location ?? 'See collection instructions in your account.')}</p><footer>Keep this invoice for your records. Your collection pass is available in the app when your order is eligible for pickup.</footer></body></html>`;
}
