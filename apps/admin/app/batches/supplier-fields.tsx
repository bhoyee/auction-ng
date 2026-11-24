'use client';
import {
  supplierTypeLabels,
  supplierTypes,
  type SupplierRow,
} from '@auction-ng/shared';
import { Input } from '@auction-ng/ui/web/input';
import { Select } from '@auction-ng/ui/web/select';
import { CategoryPicker } from './batch-form';

export type SupplierDraft = {
  name: string;
  type: (typeof supplierTypes)[number];
  contactName: string;
  phone: string;
  email: string;
  address: string;
  paymentTerms: string;
  bankName: string;
  accountNumber: string;
  usualCategoryIds: string[];
  notes: string;
};
export const emptySupplier = (): SupplierDraft => ({
  name: '',
  type: 'marketplace_returns',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  paymentTerms: '',
  bankName: '',
  accountNumber: '',
  usualCategoryIds: [],
  notes: '',
});
/** +2348035550198 → 0803 555 0198 */
export const localPhone = (phone: string | null) => {
  const match = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(phone ?? '');
  return match ? `0${match[1]} ${match[2]} ${match[3]}` : (phone ?? '');
};
export const supplierDraft = (s: SupplierRow): SupplierDraft => ({
  name: s.name,
  type: s.type as SupplierDraft['type'],
  contactName: s.contactName ?? '',
  phone: localPhone(s.phone),
  email: s.email ?? '',
  address: s.address ?? '',
  paymentTerms: s.paymentTerms ?? '',
  bankName: s.bank?.bankName ?? '',
  accountNumber: s.bank?.accountNumber ?? '',
  usualCategoryIds: s.usualCategoryIds,
  notes: s.notes ?? '',
});
/** Bank details are sent only by staff who can see them. */
export const supplierInput = (
  { bankName, accountNumber, ...draft }: SupplierDraft,
  canSeeBank: boolean,
) => ({
  ...draft,
  ...(canSeeBank ? { bank: { bankName, accountNumber } } : {}),
});

const terms = [
  'Full payment when bought',
  'Full payment on collection',
  'Full payment on delivery',
];
export function SupplierFields({
  draft,
  errors,
  canSeeBank,
  categories,
  disabled = false,
  small = false,
  onChange,
}: {
  draft: SupplierDraft;
  errors: Record<string, string>;
  canSeeBank: boolean;
  categories: { id: string; name: string }[];
  disabled?: boolean;
  /** Two columns, for the Add batch dialog. */
  small?: boolean;
  onChange: (draft: SupplierDraft) => void;
}) {
  const set = <K extends keyof SupplierDraft>(k: K, v: SupplierDraft[K]) =>
    onChange({ ...draft, [k]: v });
  const error = (field: string) => errors[field] || undefined;
  return (
    <fieldset className="lv-batch-plain" disabled={disabled}>
      <div
        className={`lv-setup-grid lv-setup-grid--${small ? '2' : '3'} lv-batch-supplier`}
      >
        <Input
          label="Supplier name"
          value={draft.name}
          maxLength={120}
          error={error('name')}
          onChange={(e) => set('name', e.target.value)}
        />
        <Select
          label="Type"
          value={draft.type}
          error={error('type')}
          onChange={(e) => set('type', e.target.value as SupplierDraft['type'])}
        >
          {supplierTypes.map((t) => (
            <option key={t} value={t}>
              {supplierTypeLabels[t]}
            </option>
          ))}
        </Select>
        <Input
          label="Contact person"
          value={draft.contactName}
          maxLength={120}
          error={error('contactName')}
          onChange={(e) => set('contactName', e.target.value)}
        />
        <Input
          label="Phone"
          value={draft.phone}
          inputMode="tel"
          maxLength={20}
          placeholder="0803 555 0198"
          error={error('phone')}
          onChange={(e) => set('phone', e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          value={draft.email}
          maxLength={200}
          error={error('email')}
          onChange={(e) => set('email', e.target.value)}
        />
        <Input
          label="Address"
          value={draft.address}
          maxLength={300}
          error={error('address')}
          onChange={(e) => set('address', e.target.value)}
        />
        <Select
          label="Payment terms"
          value={draft.paymentTerms}
          error={error('paymentTerms')}
          onChange={(e) => set('paymentTerms', e.target.value)}
        >
          <option value="">Not recorded</option>
          {[
            ...terms,
            ...(draft.paymentTerms && !terms.includes(draft.paymentTerms)
              ? [draft.paymentTerms]
              : []),
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
        {canSeeBank && (
          <>
            <Input
              label="Bank"
              value={draft.bankName}
              maxLength={80}
              hint="Finance and admin only"
              error={error('bank.bankName')}
              onChange={(e) => set('bankName', e.target.value)}
            />
            <Input
              label="Account number"
              value={draft.accountNumber}
              inputMode="numeric"
              maxLength={10}
              hint="Finance and admin only"
              error={error('bank.accountNumber')}
              onChange={(e) =>
                set('accountNumber', e.target.value.replace(/\D/g, ''))
              }
            />
          </>
        )}
      </div>
      <CategoryPicker
        label="Usually sells"
        options={categories}
        value={draft.usualCategoryIds}
        error={error('usualCategoryIds')}
        onChange={(v) => set('usualCategoryIds', v)}
      />
      <Input
        label="Notes"
        value={draft.notes}
        maxLength={1000}
        error={error('notes')}
        onChange={(e) => set('notes', e.target.value)}
      />
    </fieldset>
  );
}
