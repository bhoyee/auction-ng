import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { expect, it } from 'vitest';

type Route = { route: string; children: Route[] };
type RouteContext = ((key: string) => { default: () => null }) & {
  keys: () => string[];
};
const require = createRequire(
  new URL('../apps/mobile/package.json', import.meta.url),
);
const { getRoutes } = require('expo-router/build/getRoutes') as {
  getRoutes: (context: RouteContext, options: Record<string, unknown>) => Route;
};

it.each(['android', 'ios'])(
  'resolves /wallet as a normal stack screen outside the bottom tabs on %s',
  (platform) => {
    const root = new URL('../apps/mobile/app/', import.meta.url);
    const keys = readdirSync(root, { recursive: true })
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => './' + name.replaceAll('\\', '/'));
    const context: RouteContext = Object.assign(
      () => ({ default: () => null }),
      { keys: () => keys },
    );
    const tree = getRoutes(context, {
      platform,
      importMode: 'sync',
      ignoreEntryPoints: true,
    });
    const wallets: { node: Route; parent: Route }[] = [];
    function visit(parent: Route) {
      for (const node of parent.children ?? []) {
        if (node.route === 'wallet') wallets.push({ node, parent });
        visit(node);
      }
    }
    visit(tree);
    expect(wallets).toHaveLength(1);
    expect(wallets[0]?.parent.route).toBe('');
  },
);
