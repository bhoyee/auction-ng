import { expect, it } from 'vitest';
import {
  calculateInvoiceLine,
  DEFAULT_FEE_RULES,
} from '../packages/shared/src/fees';
import { formatNaira } from '../packages/shared/src/money';
import { helpBlockText, helpTopics } from '../apps/web/lib/help-content';

it('gives every topic and question a unique link', () => {
  const ids = helpTopics.flatMap((topic) => [
    topic.id,
    ...topic.questions.map((question) => question.id),
  ]);
  expect(new Set(ids).size).toBe(ids.length);
  // Links other pages already use (#faqs and #contact are on the page itself).
  for (const id of ['bidding', 'returns', 'condition-grades'])
    expect(ids).toContain(id);
});

it('quotes the fee example from the checkout calculation', () => {
  const line = calculateInvoiceLine(2000000, DEFAULT_FEE_RULES);
  const example = helpTopics
    .flatMap((topic) => topic.questions)
    .find((question) => question.id === 'fee-example');
  const text = example?.answer.map(helpBlockText).join(' ') ?? '';
  for (const amount of [
    line.hammerKobo,
    line.premiumKobo,
    line.lotFeeKobo,
    line.vatKobo,
    line.totalKobo,
  ])
    expect(text).toContain(formatNaira(amount));
});

it('states the owner-approved pickup storage charge and support hours', () => {
  const all = helpTopics
    .flatMap((topic) => topic.questions)
    .flatMap((question) => question.answer.map(helpBlockText))
    .join(' ');
  expect(all).toContain('₦1,000 per day');
  expect(all).toContain('Delivery is not available for now');
  expect(all).not.toMatch(/international card/i);
});
