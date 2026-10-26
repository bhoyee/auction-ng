import { expect, test } from '@playwright/test';
test('prose renders natural punctuation, with tabular digits restricted to numbers', async ({
  page,
}) => {
  await page.goto('http://localhost:3310/sign-in');
  await page.evaluate(() => document.fonts.ready);
  const measured = await page.evaluate(() => {
    const span = document.createElement('span');
    span.style.fontSize = '16px';
    span.style.display = 'inline-block';
    document.body.append(span);
    span.textContent = '.';
    const punctuation = span.getBoundingClientRect().width;
    span.textContent = '0';
    const digit = span.getBoundingClientRect().width;
    span.remove();
    return {
      punctuation,
      digit,
      texts: Array.from(document.querySelectorAll('h1,h2,p,button,a')).map(
        (element) => element.textContent ?? '',
      ),
    };
  });
  // Schibsted's tabular punctuation was ~10 px wide, versus ~4.5 px normally.
  expect(measured.punctuation).toBeLessThan(measured.digit * 0.7);
  for (const text of measured.texts) expect(text).not.toMatch(/[^\S\n][,.!?]/);
});
