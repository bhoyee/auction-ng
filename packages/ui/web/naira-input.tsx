'use client';
import { useState } from 'react';
import { parseNairaInput } from '../presentation';
import { Input } from './input';
export function NairaInput({
  label = 'Bid amount (₦)',
  onAmountChange,
  initialValue = '',
  ...props
}: Omit<
  Parameters<typeof Input>[0],
  'value' | 'onChange' | 'label' | 'type'
> & {
  label?: string;
  onAmountChange: (kobo: number | undefined) => void;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <Input
      {...props}
      label={label}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        onAmountChange(parseNairaInput(event.target.value));
      }}
    />
  );
}
