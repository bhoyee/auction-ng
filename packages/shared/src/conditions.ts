import { z } from 'zod';
import { databaseValues } from './database-values';

// Condition badge colours staff can pick in Lot setup. The same names drive
// the badges on the buyer website, the mobile app and admin
// (palette in packages/ui tokens.conditionPalette).
export const conditionColours = [
  'green',
  'mint',
  'indigo',
  'blue',
  'amber',
  'red',
  'grey',
] as const;
export type ConditionColour = (typeof conditionColours)[number];
export type ConditionKey = (typeof databaseValues.lotConditions)[number];

// Used until the live settings load, and if they can't be loaded.
export const conditionDefaults: Record<
  ConditionKey,
  { label: string; colour: ConditionColour }
> = {
  new: { label: 'New', colour: 'green' },
  like_new: { label: 'Like new', colour: 'mint' },
  open_box: { label: 'Open box', colour: 'indigo' },
  damaged: { label: 'Damaged', colour: 'red' },
  untested: { label: 'Untested', colour: 'amber' },
};

export const publicConditionSchema = z
  .object({
    key: z.enum(databaseValues.lotConditions),
    label: z.string(),
    meaning: z.string(),
    colour: z.enum(conditionColours),
    active: z.boolean(),
  })
  .strict();
export const publicConditionListSchema = z
  .object({ items: z.array(publicConditionSchema).max(20) })
  .strict();
export type PublicCondition = z.infer<typeof publicConditionSchema>;
