import { describe, expect, it } from 'vitest';
import {
  exampleWinItems,
  exampleWins as generate,
} from '../apps/web/lib/example-wins';

// Every item has an image in these tests unless a case says otherwise.
const allImages = Object.fromEntries(
  exampleWinItems.map((item) => [item.slug, `/wins/${item.slug}.webp`]),
);
const exampleWins = (now: Date) => generate(allImages, now);

describe('example wins (illustrative home slides)', () => {
  const morning = new Date('2026-11-10T07:00:00Z');
  const evening = new Date('2026-11-10T21:00:00Z'); // still 10 Nov in Lagos
  const nextDay = new Date('2026-11-11T07:00:00Z');

  it('keeps one set per Lagos day and changes the next day', () => {
    expect(exampleWins(evening)).toEqual(
      exampleWins(morning).map((win) => ({
        ...win,
        dateIso: expect.any(String),
      })),
    );
    expect(exampleWins(nextDay).map((win) => win.firstName)).not.toEqual(
      exampleWins(morning).map((win) => win.firstName),
    );
  });

  it('shows five distinct people and items with sane whole-kobo prices', () => {
    const wins = exampleWins(morning);
    expect(wins).toHaveLength(5);
    expect(new Set(wins.map((win) => win.firstName)).size).toBe(5);
    expect(new Set(wins.map((win) => win.title)).size).toBe(5);
    for (const win of wins) {
      expect(Number.isSafeInteger(win.retailKobo)).toBe(true);
      expect(Number.isSafeInteger(win.winningKobo)).toBe(true);
      expect(win.winningKobo).toBeGreaterThan(0);
      expect(win.winningKobo).toBeLessThan(win.retailKobo);
      expect(win.image).toMatch(/^\/wins\/[a-z0-9-]+\.webp$/);
      // Prices follow the owner-approved table for that gadget.
      const item = exampleWinItems.find((entry) => entry.title === win.title);
      expect(win.retailKobo).toBe((item?.retail ?? 0) * 100);
      expect(win.winningKobo).toBeGreaterThanOrEqual((item?.win[0] ?? 0) * 100);
      expect(win.winningKobo).toBeLessThanOrEqual((item?.win[1] ?? 0) * 100);
      expect(Date.parse(win.dateIso)).toBeLessThan(morning.getTime());
    }
    const dates = wins.map((win) => win.dateIso);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('only uses items with an image and shrinks the set to match', () => {
    const wins = generate(
      {
        earbuds: '/wins/stand-in/earbuds.webp',
        smartwatch: '/wins/smartwatch.png',
      },
      morning,
    );
    expect(wins.map((win) => win.title).sort()).toEqual([
      'Smartwatch',
      'Wireless earbuds',
    ]);
    expect(generate({}, morning)).toEqual([]);
  });
});
