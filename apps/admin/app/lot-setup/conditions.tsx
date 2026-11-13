'use client';
import { conditionColours } from '@auction-ng/shared/conditions';
import { tokens } from '@auction-ng/ui';
import { useState } from 'react';
import type { ConditionRow } from '@auction-ng/shared';
import { Button } from '@auction-ng/ui/web/button';
import { Input } from '@auction-ng/ui/web/input';
import { Select } from '@auction-ng/ui/web/select';
import { Dialog } from '@auction-ng/ui/web/dialog';
import { Switch } from '@auction-ng/ui/admin/switch';
import { GripVertical, Pencil } from '@auction-ng/ui/web/icons';
import {
  describeFailure,
  errorFor,
  useLoad,
  useSetupClient,
  type FieldErrors,
  type SetupContext,
} from './setup-data';

// Same colour names and palette as the buyer badges on web and app.
const colours = conditionColours;
const colourLabel: Record<(typeof colours)[number], string> = {
  green: 'Green',
  mint: 'Light green',
  indigo: 'Indigo',
  blue: 'Blue',
  amber: 'Amber',
  red: 'Red',
  grey: 'Grey',
};

export function ConditionsTab({ ctx }: { ctx: SetupContext }) {
  const client = useSetupClient(ctx);
  const [version, setVersion] = useState(0);
  const list = useLoad(ctx, () => client.conditions(), [version]);
  const [editing, setEditing] = useState<ConditionRow>();
  const [toast, setToast] = useState('');
  const [problem, setProblem] = useState('');
  const [dragging, setDragging] = useState<string>();
  const items = list.data?.items ?? [];
  const refresh = () => {
    setVersion((v) => v + 1);
    ctx.onChanged();
  };
  async function act(work: () => Promise<{ message: string }>) {
    setProblem('');
    try {
      setToast((await work()).message);
      refresh();
    } catch (failure) {
      setProblem(
        Object.values(describeFailure(failure, ctx))[0] ?? 'Not saved.',
      );
    }
  }
  function reorder(id: string, onto: string) {
    const ids = items.map((i) => i.id).filter((x) => x !== id);
    ids.splice(ids.indexOf(onto), 0, id);
    void act(() => client.orderConditions({ ids }));
  }
  function nudge(id: string, step: -1 | 1) {
    const index = items.findIndex((i) => i.id === id);
    const onto = items[index + step];
    if (onto) reorder(id, onto.id);
  }
  if (list.loading && !list.data)
    return (
      <div
        className="lv-setup-card lv-setup-skeleton lv-setup-skeleton--rows"
        aria-busy="true"
      />
    );
  if (list.error && !list.data)
    return (
      <div className="lv-setup-card lv-setup-state" role="alert">
        <p>{list.error}</p>
        <Button variant="secondary" onClick={list.refresh}>
          Try again
        </Button>
      </div>
    );
  return (
    <div className="lv-setup-stack">
      {toast && (
        <p className="lv-setup-toast" role="status">
          {toast}
        </p>
      )}
      {problem && (
        <p className="lv-setup-alert" role="alert">
          {problem}
        </p>
      )}
      <section className="lv-setup-card lv-setup-card--flush">
        <table className="lv-setup-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Order</span>
              </th>
              <th scope="col">Condition</th>
              <th scope="col">What it means for buyers</th>
              <th scope="col" className="lv-setup-right">
                Lots
              </th>
              <th scope="col">On</th>
              <th scope="col">
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr
                key={c.id}
                draggable={ctx.canManage}
                data-dragging={dragging === c.id || undefined}
                onDragStart={() => setDragging(c.id)}
                onDragEnd={() => setDragging(undefined)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging && dragging !== c.id) reorder(dragging, c.id);
                }}
              >
                <td className="lv-setup-grip-cell">
                  {ctx.canManage && (
                    <button
                      type="button"
                      className="lv-setup-grip"
                      aria-label={`Reorder ${c.label}. Use the up and down arrow keys.`}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          nudge(c.id, -1);
                        }
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          nudge(c.id, 1);
                        }
                      }}
                    >
                      <GripVertical size={14} aria-hidden="true" />
                    </button>
                  )}
                </td>
                <td>
                  <BuyerBadge colour={c.colour} label={c.label} />
                </td>
                <td>{c.meaning}</td>
                <td className="lv-setup-right">
                  {c.lots.toLocaleString('en-NG')}
                </td>
                <td>
                  <Switch
                    hideLabel
                    label={`${c.label} switched on`}
                    checked={c.active}
                    disabled={!ctx.canManage}
                    onChange={(active) =>
                      void act(() =>
                        client.saveCondition({
                          id: c.id,
                          label: c.label,
                          meaning: c.meaning,
                          colour: c.colour as (typeof colours)[number],
                          active,
                          expectedUpdatedAt: c.updatedAt,
                        }),
                      )
                    }
                  />
                </td>
                <td>
                  {ctx.canManage && (
                    <button
                      type="button"
                      className="lv-setup-icon-button"
                      aria-label={`Edit ${c.label}`}
                      onClick={() => setEditing(c)}
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="lv-setup-table-foot">
          Conditions can’t be deleted because buyer filters use them. Switch one
          off to stop staff picking it for new lots; existing lots keep theirs.
        </p>
      </section>
      {editing && (
        <ConditionDialog
          ctx={ctx}
          condition={editing}
          onClose={() => setEditing(undefined)}
          onSaved={(message) => {
            setEditing(undefined);
            setToast(message);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ConditionDialog({
  ctx,
  condition,
  onClose,
  onSaved,
}: {
  ctx: SetupContext;
  condition: ConditionRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const client = useSetupClient(ctx);
  const [label, setLabel] = useState(condition.label);
  const [meaning, setMeaning] = useState(condition.meaning);
  const [colour, setColour] = useState(
    condition.colour as (typeof colours)[number],
  );
  const [active, setActive] = useState(condition.active);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open title={`Edit ${condition.label}`} onClose={onClose}>
      <form
        className="lv-setup-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErrors({});
          try {
            const result = await client.saveCondition({
              id: condition.id,
              label,
              meaning,
              colour,
              active,
              expectedUpdatedAt: condition.updatedAt,
            });
            onSaved(result.message);
          } catch (failure) {
            setErrors(describeFailure(failure, ctx));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          label="Name"
          value={label}
          maxLength={40}
          error={errorFor(errors, 'label')}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Input
          label="What it means for buyers"
          value={meaning}
          maxLength={200}
          error={errorFor(errors, 'meaning')}
          hint="One short sentence, shown on the lot page."
          onChange={(e) => setMeaning(e.target.value)}
        />
        <Select
          label="Colour"
          value={colour}
          onChange={(e) =>
            setColour(e.target.value as (typeof colours)[number])
          }
        >
          {colours.map((c) => (
            <option key={c} value={c}>
              {colourLabel[c]}
            </option>
          ))}
        </Select>
        <p>
          Preview:{' '}
          <BuyerBadge colour={colour} label={label || condition.label} />
        </p>
        <Switch
          label="Switched on for new lots"
          checked={active}
          onChange={setActive}
        />
        {errors.form && <p className="lv-setup-error">{errors.form}</p>}
        <div className="lv-setup-actions lv-setup-actions--end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Save condition
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// Exactly how the badge looks to buyers on the website and in the app.
function BuyerBadge({ colour, label }: { colour: string; label: string }) {
  const palette =
    tokens.conditionPalette[
      (colours as readonly string[]).includes(colour)
        ? (colour as (typeof colours)[number])
        : 'grey'
    ];
  return (
    <span className="agn-badge" style={palette}>
      {label}
    </span>
  );
}
