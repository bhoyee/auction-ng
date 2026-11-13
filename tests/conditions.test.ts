import { describe, expect, it } from 'vitest';
import {
  conditionColours,
  conditionDefaults,
} from '../packages/shared/src/conditions';
import { databaseValues } from '../packages/shared/src/database-values';
import { tokens } from '../packages/ui/tokens';

describe('condition badges', () => {
  it('has a default label and colour for every condition', () => {
    for (const key of databaseValues.lotConditions)
      expect(conditionDefaults[key]).toMatchObject({
        label: expect.any(String),
        colour: expect.stringMatching(
          new RegExp(`^(${conditionColours.join('|')})$`),
        ),
      });
  });

  it('has a palette entry for every colour staff can pick', () => {
    for (const colour of conditionColours)
      expect(tokens.conditionPalette[colour]).toEqual({
        backgroundColor: expect.stringMatching(/^#[0-9A-F]{6}$/),
        color: expect.stringMatching(/^#[0-9A-F]{6}$/),
      });
  });

  it('keeps the defaults identical to the badges buyers saw before', () => {
    for (const key of databaseValues.lotConditions)
      expect(tokens.conditionPalette[conditionDefaults[key].colour]).toEqual(
        tokens.conditionBadges[key],
      );
  });
});
