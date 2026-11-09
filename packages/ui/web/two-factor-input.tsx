'use client';
import { useState } from 'react';
import type { TwoFactorProof } from '@auction-ng/shared/two-factor-schemas';
import { OtpInput } from './otp-input';
import { Input } from './input';
import { Button } from './button';

export function TwoFactorInput({
  value,
  onChange,
  disabled = false,
}: {
  value: TwoFactorProof;
  onChange: (value: TwoFactorProof) => void;
  disabled?: boolean;
}) {
  const [recovery, setRecovery] = useState(value.method === 'recovery');
  return (
    <div className="agn-mfa-input">
      {recovery ? (
        <Input
          label="Single-use recovery code"
          value={value.code}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          maxLength={29}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
          onChange={(event) =>
            onChange({
              method: 'recovery',
              code: event.target.value.toUpperCase(),
            })
          }
          required
        />
      ) : (
        <OtpInput
          label="Authenticator code"
          hint="Codes change every 30 seconds. Wait for a new code if you have just used one."
          value={value.code}
          onValueChange={(code) => onChange({ method: 'authenticator', code })}
          disabled={disabled}
          required
        />
      )}
      <Button
        variant="ghost"
        disabled={disabled}
        onClick={() => {
          setRecovery(!recovery);
          onChange({
            method: recovery ? 'authenticator' : 'recovery',
            code: '',
          });
        }}
      >
        {recovery ? 'Use authenticator instead' : 'Use a recovery code'}
      </Button>
    </div>
  );
}
