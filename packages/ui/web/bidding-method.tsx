'use client';
import { useId } from 'react';
import type { BidMode } from '@auction-ng/shared/auction-rules';

export function BiddingMethod({
  value,
  onChange,
  disabled,
}: {
  value: BidMode;
  onChange: (value: BidMode) => void;
  disabled: boolean;
}) {
  const name = useId();
  return (
    <fieldset className="agn-bidding-method" disabled={disabled}>
      <legend>Bidding method</legend>
      <div>
        <label>
          <input
            type="radio"
            name={name}
            value="direct"
            checked={value === 'direct'}
            onChange={() => onChange('direct')}
          />
          <span>Bid full amount</span>
        </label>
        <label>
          <input
            type="radio"
            name={name}
            value="automatic"
            checked={value === 'automatic'}
            onChange={() => onChange('automatic')}
          />
          <span>Automatic spending limit</span>
        </label>
      </div>
    </fieldset>
  );
}
