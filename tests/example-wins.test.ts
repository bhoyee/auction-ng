import { describe, expect, it } from 'vitest';
import { exampleWins } from '../apps/web/lib/example-wins';

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
      expect(win.image).toMatch(/^\/demo\/[a-z]+-thumb\.webp$/);
      expect(Date.parse(win.dateIso)).toBeLessThan(morning.getTime());
    }
    const dates = wins.map((win) => win.dateIso);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
