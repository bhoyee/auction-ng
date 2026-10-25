import { expect, it } from 'vitest';
import { countdown, parseNairaInput } from '../packages/ui/presentation';

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
