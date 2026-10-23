import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { tokens } from '../packages/ui/tokens';

it('resolves the intended React versions independently in each app', () => {
  const versions = { web: '19.2.0', admin: '19.2.0', mobile: '19.3.0' };
  for (const [app, version] of Object.entries(versions)) {
    const require = createRequire(
      new URL(`../apps/${app}/package.json`, import.meta.url),
    );
    expect(require('react/package.json').version).toBe(version);
    expect(require('react-dom/package.json').version).toBe(version);
  }
});

it('keeps generated Tailwind colour tokens in sync with the mobile theme', () => {
  const css = readFileSync(
    new URL('../packages/ui/theme.css', import.meta.url),
    'utf8',
  );
  for (const [name, value] of Object.entries(tokens.colors)) {
    expect(css.toLowerCase()).toContain(
      `--color-${name}: ${value};`.toLowerCase(),
    );
  }
});
