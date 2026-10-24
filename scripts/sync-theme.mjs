import { writeFileSync } from 'node:fs';
import { format } from 'prettier';
import { tokens } from '../packages/ui/tokens.ts';
import { signInEmailTemplate } from '../packages/ui/emails/sign-in-email.ts';

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
  return `/* Generated from tokens.ts by pnpm tokens:generate. */\n@theme inline {\n${[...colors, ...sizes, ...radii, '  --font-brand: var(--font-schibsted), "Schibsted Grotesk", sans-serif;'].join('\n')}\n}\n`;
}

writeFileSync(
  new URL('../packages/ui/theme.css', import.meta.url),
  await format(themeCss(), { parser: 'css', singleQuote: true }),
);
writeFileSync(
  new URL('../apps/api/src/auth/sign-in-email.generated.json', import.meta.url),
  await format(JSON.stringify(signInEmailTemplate()), { parser: 'json' }),
);
