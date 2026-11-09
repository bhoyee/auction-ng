import { readFile, writeFile } from 'node:fs/promises';
const original = JSON.parse(
  await readFile(
    new URL(
      '../apps/api/src/withdrawals/withdrawal-email.generated.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const render = (text) =>
  text
    .replaceAll('Wallet withdrawal update', 'Purchase refund')
    .replaceAll('<br>Bank account ending <strong>{{last4}}</strong>', '')
    .replaceAll('\nBank account ending: {{last4}}', '')
    .replace(
      /<tr><td style="padding:0 0 16px">\{\{feeLabel\}\}<\/td><td align="right">\{\{fees\}\}<\/td><\/tr>/g,
      '',
    )
    .replaceAll('\n{{feeLabel}}: {{fees}}', '')
    .replaceAll(
      'If you did not request this withdrawal, contact support immediately.',
      'Questions about this refund? Contact our support team.',
    );
await writeFile(
  new URL(
    '../apps/api/src/staff-admin/refund-email.generated.json',
    import.meta.url,
  ),
  JSON.stringify(
    { html: render(original.html), text: render(original.text) },
    null,
    2,
  ) + '\n',
);
