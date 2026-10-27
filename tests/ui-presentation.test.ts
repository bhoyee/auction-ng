import { expect, it } from 'vitest';
import { countdown, parseNairaInput } from '../packages/ui/presentation';
import { productImageSource } from '../packages/ui/web/demo-image';

it.each([
  [
    'https://demo.auction.invalid/demo/phones-thumb.webp',
    '/demo/phones-thumb.webp',
  ],
  [
    'https://demo.auction.invalid/demo/kitchen-display.webp',
    '/demo/kitchen-display.webp',
  ],
  [
    'https://images.example.test/demo/phones-thumb.webp',
    'https://images.example.test/demo/phones-thumb.webp',
  ],
  [
    'https://demo.auction.invalid.example.test/demo/phones-thumb.webp',
    'https://demo.auction.invalid.example.test/demo/phones-thumb.webp',
  ],
  [
    'https://demo.auction.invalid/demo/phones-thumb.webp?private=1',
    'https://demo.auction.invalid/demo/phones-thumb.webp?private=1',
  ],
  [
    'https://demo.auction.invalid/actual-stock/phones-thumb.webp',
    'https://demo.auction.invalid/actual-stock/phones-thumb.webp',
  ],
])('maps only the isolated local demo image alias %s', (source, expected) => {
  expect(productImageSource(source)).toBe(expected);
});

it.each([
  ['12500', 1250000],
  ['12500.5', 1250050],
  ['0.01', 1],
  ['0', 0],
  ['90071992547409.91', Number.MAX_SAFE_INTEGER],
  ['90071992547409.92', undefined],
  ['12.345', undefined],
  ['1e3', undefined],
  ['-1', undefined],
  ['', undefined],
  ['12,500', undefined],
  ['Infinity', undefined],
])(
  'parses amount input %s without accepting rounding or unsafe kobo',
  (value, expected) => {
    expect(parseNairaInput(value)).toBe(expected);
  },
);

it.each([
  [0, 'Ended', false],
  [1, '0m 01s', true],
  [119000, '1m 59s', true],
  [120000, '2m left', true],
  [599000, '9m left', true],
  [600000, '10m left', false],
  [3600000, '1h 0m', false],
])('formats a server-clock countdown at %d ms', (duration, text, urgent) => {
  const state = countdown(10000000 + duration, 10000000);
  expect(state.text).toBe(text);
  expect(state.urgent).toBe(urgent);
  expect(state.label).toBeTruthy();
});

it.each([
  [0, 'Ended'],
  [1, '00m 01s'],
  [120000, '02m 00s'],
  [3601000, '1h 00m 01s'],
  [90061000, '1d 1h 01m 01s'],
])('shows seconds in item-card countdowns at %d ms', (duration, text) => {
  expect(
    countdown(10000000 + duration, 10000000, { showSeconds: true }).text,
  ).toBe(text);
});
