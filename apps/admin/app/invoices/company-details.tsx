'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  companyFields,
  companyLabels,
  type CompanyDetails,
} from '@auction-ng/shared';
import { createInvoicesClient } from '@auction-ng/api-client/invoices';
import { Button } from '@auction-ng/ui/web/button';
import { Input } from '@auction-ng/ui/web/input';
import { Textarea } from '@auction-ng/ui/web/textarea';
import { fieldErrors, LoadState, useBatchLoad } from '../batches/batch-ui';

/** Settings: what is printed at the top and bottom of invoices. */
export function CompanySettings({
  apiUrl,
  accessToken,
  deviceId,
  online,
}: {
  apiUrl: string;
  accessToken: string;
  deviceId: string;
  online: boolean;
}) {
  const client = useMemo(
    () => createInvoicesClient(apiUrl, { accessToken, deviceId }),
    [apiUrl, accessToken, deviceId],
  );
  const read = useBatchLoad(() => client.company(), [client]);
  const [draft, setDraft] = useState<CompanyDetails>();
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  // A silent refresh never replaces what someone is typing.
  useEffect(() => {
    if (!read.data || dirty) return;
    setDraft(read.data.details);
    setRevision(read.data.revision);
  }, [read.data, dirty]);
  if (!draft)
    return (
      <section className="lv-setup-card">
        <LoadState error={read.error} onRetry={read.reload} />
      </section>
    );
  return (
    <form
      className="lv-setup-card lv-inv-company"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErrors({});
        setToast('');
        try {
          const result = await client.saveCompany({
            idempotencyKey: key,
            details: draft,
            expectedRevision: revision,
          });
          setToast(result.message);
          setDirty(false);
          setKey(crypto.randomUUID());
          read.reload();
        } catch (failure) {
          setErrors(fieldErrors(failure));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <h2>Company details</h2>
        <p className="lv-setup-card-note">
          Printed on every invoice and receipt PDF. Anything left blank is left
          off.
        </p>
      </div>
      {toast && (
        <p className="lv-setup-toast" role="status">
          {toast}
        </p>
      )}
      <div className="lv-setup-grid lv-setup-grid--2">
        {companyFields
          .filter((f) => f !== 'terms')
          .map((field) => (
            <Input
              key={field}
              label={companyLabels[field]}
              value={draft[field]}
              type={field === 'email' ? 'email' : 'text'}
              maxLength={240}
              error={errors[`details.${field}`] || undefined}
              onChange={(e) => {
                setDraft({ ...draft, [field]: e.target.value });
                setDirty(true);
                setKey(crypto.randomUUID());
              }}
            />
          ))}
      </div>
      <Textarea
        label={companyLabels.terms}
        value={draft.terms}
        maxLength={600}
        rows={3}
        onChange={(e) => {
          setDraft({ ...draft, terms: e.target.value });
          setDirty(true);
          setKey(crypto.randomUUID());
        }}
      />
      {errors.form && (
        <p className="lv-setup-error" role="alert">
          {errors.form}
        </p>
      )}
      <div className="lv-setup-actions lv-setup-actions--end">
        <Button
          variant="secondary"
          disabled={!dirty || busy}
          onClick={() => {
            setDirty(false);
            setErrors({});
          }}
        >
          Discard
        </Button>
        <Button type="submit" busy={busy} disabled={!dirty || !online}>
          Save details
        </Button>
      </div>
    </form>
  );
}
