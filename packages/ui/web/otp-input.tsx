'use client';

import { Input } from './input';
export function OtpInput(
  props: Omit<
    Parameters<typeof Input>[0],
    'inputMode' | 'autoComplete' | 'maxLength' | 'pattern' | 'type'
  >,
) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      pattern="[0-9]{6}"
      className="agn-otp"
    />
  );
}
