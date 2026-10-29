'use client';
import { useEffect, useId, useRef, useState } from 'react';
type Props = {
  label: string;
  hint?: string;
  error?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
};
export function OtpInput({
  label,
  hint,
  error,
  value,
  defaultValue = '',
  onValueChange,
  required,
  disabled,
}: Props) {
  const id = useId();
  const initial = (value ?? defaultValue)
    .padEnd(6, ' ')
    .slice(0, 6)
    .split('')
    .map((char) => (char === ' ' ? '' : char));
  const [digits, setDigits] = useState(initial);
  const current = useRef(initial);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => {
    if (value !== undefined && value !== current.current.join('')) {
      const next = value
        .padEnd(6, ' ')
        .slice(0, 6)
        .split('')
        .map((char) => (char === ' ' ? '' : char));
      current.current = next;
      setDigits(next);
    }
  }, [value]);
  const update = (index: number, text: string) => {
    const clean = text.replace(/\D/g, '').slice(0, 6 - index);
    const next = [...current.current];
    if (!clean) next[index] = '';
    else
      for (const [offset, char] of [...clean].entries())
        next[index + offset] = char;
    current.current = next;
    setDigits(next);
    onValueChange?.(next.join(''));
    if (clean) inputs.current[Math.min(index + clean.length, 5)]?.focus();
  };
  return (
    <fieldset
      className="agn-otp-field"
      aria-describedby={hint || error ? id + '-help' : undefined}
    >
      <legend>{label}</legend>
      <div className="agn-otp-digits">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(node) => {
              inputs.current[index] = node;
            }}
            aria-label={index === 0 ? label : `Digit ${index + 1} of 6`}
            className="agn-input"
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            pattern="[0-9]"
            maxLength={index === 0 ? 6 : 1}
            required={required}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            value={digit}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => update(index, event.target.value)}
            onPaste={(event) => {
              event.preventDefault();
              const pasted = event.clipboardData
                .getData('text')
                .replace(/\D/g, '');
              update(pasted.length >= 6 ? 0 : index, pasted);
            }}
            onKeyDown={(event) => {
              if (
                event.key === 'Backspace' &&
                !current.current[index] &&
                index > 0
              ) {
                event.preventDefault();
                update(index - 1, '');
                inputs.current[index - 1]?.focus();
              }
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                inputs.current[
                  Math.max(
                    0,
                    Math.min(5, index + (event.key === 'ArrowLeft' ? -1 : 1)),
                  )
                ]?.focus();
              }
            }}
          />
        ))}
      </div>
      {(hint || error) && (
        <p id={id + '-help'} className={error ? 'agn-field-error' : 'agn-hint'}>
          {error ?? hint}
        </p>
      )}
    </fieldset>
  );
}
