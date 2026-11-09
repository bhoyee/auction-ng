'use client';
// Accessible on/off switch for admin settings (Required, Shown to buyers,
// pickup rules). Always labelled; the label may be visually hidden.
export function Switch({
  checked,
  onChange,
  label,
  hideLabel = false,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hideLabel?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="lv-switch">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={hideLabel ? label : undefined}
        disabled={disabled}
        className="lv-switch-track"
        onClick={() => onChange(!checked)}
      >
        <span className="lv-switch-thumb" aria-hidden="true" />
      </button>
      {!hideLabel && <span className="lv-switch-label">{label}</span>}
    </label>
  );
}
