import { describe, expect, it } from 'vitest';
import { descriptionBlocks } from '../apps/mobile/lib/description-blocks';

describe('native lot description blocks', () => {
  it('bolds only short heading lines, never the details under them', () => {
    const text = [
      'The iPhone 15 is a capable phone.',
      '',
      'Key features:',
      'Display: 6.1-inch Super Retina XDR OLED',
      'Processor: A16 Bionic chip',
      'Who is this for?',
      'Buyers who want a recent iPhone.',
    ].join('\r\n');
    expect(descriptionBlocks(text)).toEqual([
      { kind: 'text', text: 'The iPhone 15 is a capable phone.' },
      { kind: 'heading', text: 'Key features' },
      { kind: 'text', text: 'Display: 6.1-inch Super Retina XDR OLED' },
      { kind: 'text', text: 'Processor: A16 Bionic chip' },
      { kind: 'heading', text: 'Who is this for?' },
      { kind: 'text', text: 'Buyers who want a recent iPhone.' },
    ]);
  });

  it('keeps long sentences and inner-colon lines as text', () => {
    expect(
      descriptionBlocks(
        'Would this suit a student who needs a reliable phone for school?\nNote: tested:',
      ).map((block) => block.kind),
    ).toEqual(['text', 'text']);
  });

  it('returns nothing for an empty description', () => {
    expect(descriptionBlocks('  \n\n ')).toEqual([]);
  });
});
