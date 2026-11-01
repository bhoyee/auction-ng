'use client';
import { useState } from 'react';
import { parseNairaInput } from '../presentation';
import { Input } from './input';
export function NairaInput({
  label = 'Bid amount (₦)',
  onAmountChange,
  initialValue = '',
  digitsOnly = false,
  decimalOnly = false,
  ...props
}: Omit<
  Parameters<typeof Input>[0],
  'value' | 'onChange' | 'label' | 'type'
> & {
  label?: string;
  onAmountChange: (kobo: number | undefined) => void;
  initialValue?: string;
  digitsOnly?: boolean;
  decimalOnly?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <Input
      {...props}
      label={label}
      type="text"
      inputMode={digitsOnly ? 'numeric' : 'decimal'}
      pattern={digitsOnly ? '[0-9]*' : undefined}
      value={value}
      onChange={(event) => {
        if (digitsOnly && !/^[0-9]*$/.test(event.target.value)) return;
        if (
          decimalOnly &&
          !/^[0-9]*(?:\.[0-9]{0,2})?$/.test(event.target.value)
        )
          return;
        setValue(event.target.value);
        onAmountChange(parseNairaInput(event.target.value));
      }}
    />
  );
}
