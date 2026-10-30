import { writeFileSync } from 'node:fs';
import { format } from 'prettier';
import { tokens } from '../packages/ui/tokens.ts';
import { signInEmailTemplate } from '../packages/ui/emails/sign-in-email.ts';
import { winnerEmailTemplate } from '../packages/ui/emails/winner-email.ts';
import { watchLostEmailTemplate } from '../packages/ui/emails/watch-lost-email.ts';

writeFileSync(
  new URL(
    '../apps/api/src/closing/outbid-email.generated.json',
    import.meta.url,
  ),
  await format(JSON.stringify(watchLostEmailTemplate('outbid')), {
    parser: 'json',
  }),
);

export function themeCss() {
  const colors = Object.entries(tokens.colors).map(
    ([name, value]) => `  --color-${name}: ${value};`,
  );
  const sizes = Object.entries(tokens.typography).flatMap(([name, value]) => [
    `  --text-${name}: ${value.fontSize}px;`,
    `  --text-${name}--line-height: ${value.lineHeight}px;`,
  ]);
  const radii = Object.entries(tokens.radius).map(
    ([name, value]) => `  --radius-${name}: ${value}px;`,
  );
  const layout = [
    `  --container-content: ${tokens.layout.content}px;`,
    `  --container-marketplace-wide: ${tokens.layout.marketplaceWide}px;`,
    `  --container-promotion: ${tokens.layout.promotion}px;`,
    `  --container-search: ${tokens.layout.search}px;`,
    `  --container-form: ${tokens.measure.body}px;`,
    `  --spacing-touch: ${tokens.layout.touch}px;`,
    `  --opacity-disabled: ${tokens.opacity.disabled};`,
    `  --shadow-floating: ${tokens.shadow.floating};`,
    `  --shadow-card-hover: ${tokens.shadow.cardHover};`,
    `  --duration-hover: ${tokens.motion.hover}ms;`,
    `  --animate-price-flash: price-flash ${tokens.motion.flash}ms ease-out;`,
  ];
  return `/* Generated from tokens.ts by pnpm tokens:generate. */\n@theme inline {\n${[...colors, ...sizes, ...radii, ...layout, '  --font-brand: var(--font-schibsted), "Schibsted Grotesk", sans-serif;'].join('\n')}\n}\n`;
}

writeFileSync(
  new URL('../packages/ui/theme.css', import.meta.url),
  await format(themeCss(), { parser: 'css', singleQuote: true }),
);
writeFileSync(
  new URL('../apps/api/src/auth/sign-in-email.generated.json', import.meta.url),
  await format(JSON.stringify(signInEmailTemplate()), { parser: 'json' }),
);
writeFileSync(
  new URL(
    '../apps/api/src/closing/winner-email.generated.json',
    import.meta.url,
  ),
  await format(JSON.stringify(winnerEmailTemplate()), { parser: 'json' }),
);
writeFileSync(
  new URL(
    '../apps/api/src/closing/watch-lost-email.generated.json',
    import.meta.url,
  ),
  await format(JSON.stringify(watchLostEmailTemplate()), { parser: 'json' }),
);
