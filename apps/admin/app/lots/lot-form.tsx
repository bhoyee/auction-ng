'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  databaseValues,
  formatNaira,
  LOT_DEFAULT_RUN_TIME_MINUTES,
  LOT_MAX_PHOTOS,
  LOT_RUN_TIME_PRESETS,
  LOT_TITLE_MAX,
  lotFormSchema,
  type LotEditor,
  type LotForm,
  type LotSetupOptions,
} from '@auction-ng/shared';
import { ApiError } from '@auction-ng/api-client/auth';
import type { LotsClient } from '@auction-ng/api-client/lots';
import type { createCatalogueClient } from '@auction-ng/api-client';
import { useConfirm } from '@auction-ng/ui/admin/confirm-dialog';
import { Button } from '@auction-ng/ui/web/button';
import { Input } from '@auction-ng/ui/web/input';
import { NairaInput } from '@auction-ng/ui/web/naira-input';
import { Select } from '@auction-ng/ui/web/select';
import { Textarea } from '@auction-ng/ui/web/textarea';
import { productImageSource } from '@auction-ng/ui/web/demo-image';
import {
  CalendarClock,
  Camera,
  Plus,
  Send,
  TriangleAlert,
  X,
} from '@auction-ng/ui/web/icons';
import { ConditionBadge, DiscountBadge } from '@auction-ng/ui/web/auction';
import { PublishDialog, type PublishRequest } from './publish-dialog';
import { conditionLabel, hoursLabel, wat } from './lots-ui';

type Catalogue = ReturnType<typeof createCatalogueClient>;
type State = {
  title: string;
  description: string;
  condition: string;
  categoryId: string;
  locationId: string;
  binId: string | null;
  brandId: string | null;
  supplierId: string | null;
  startPriceKobo?: number;
  retailPriceKobo?: number;
  runTimeMinutes: number;
  details: Record<string, string | number | boolean>;
  included: string[];
  defects: string[];
};
type Photo = {
  id: string;
  url: string;
  isDefect: boolean;
  /** Not uploaded yet: waits for the first save, then uploads. */
  pending?: File;
  /** The upload failed; 'storage' means this server has no image storage. */
  failed?: 'storage' | 'error';
};
const AUTOSAVE_MS = 30_000;
const conditionHint: Record<string, string> = {
  new: 'sealed, unused',
  like_new: 'opened, no marks',
  open_box: 'works, may lack small parts',
  damaged: 'visible damage',
  untested: 'not powered on',
};

const empty = (): State => ({
  title: '',
  description: '',
  condition: '',
  categoryId: '',
  locationId: '',
  binId: null,
  brandId: null,
  supplierId: null,
  runTimeMinutes: LOT_DEFAULT_RUN_TIME_MINUTES,
  details: {},
  included: [],
  defects: [],
});
const fromEditor = (lot: LotForm): State => ({ ...lot });
const toForm = (s: State) =>
  lotFormSchema.safeParse({
    ...s,
    startPriceKobo: s.startPriceKobo,
    retailPriceKobo: s.retailPriceKobo ?? 0,
  });

/** Browser-side compression: WebP, longest side 2000 px, when it's smaller. */
async function compress(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext('2d')
      ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, 'image/webp', 0.85),
    );
    return blob && blob.size < file.size
      ? new File([blob], file.name.replace(/\.\w+$/, '.webp'), {
          type: 'image/webp',
        })
      : file;
  } catch {
    return file;
  }
}
const sha256 = async (file: File) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', await file.arrayBuffer()),
    ),
  )
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');

export function LotFormPage({
  id,
  client,
  catalogue,
  options,
  go,
  publish,
}: {
  id: string | null;
  client: LotsClient;
  catalogue: Catalogue;
  options: LotSetupOptions | undefined;
  go: (path: string) => void;
  /** Present when this staff member may publish (auctions.manage). */
  publish?: (
    lotId: string,
    expectedUpdatedAt: string,
    request: PublishRequest,
  ) => Promise<void>;
}) {
  const [publishing, setPublishing] = useState<'now' | 'later'>();
  const { confirm, dialog } = useConfirm();
  const [state, setState] = useState<State>(empty);
  const [editor, setEditor] = useState<LotEditor>();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(!!id);
  const [loadError, setLoadError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [dragIndex, setDragIndex] = useState<number>();
  const [dropOver, setDropOver] = useState(false);
  const [customRun, setCustomRun] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const queue = useRef(Promise.resolve());
  const stateRef = useRef(state);
  stateRef.current = state;
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const keyRef = useRef(crypto.randomUUID());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!id) return;
    client
      .editor(id)
      .then((e) => {
        setEditor(e);
        setState(fromEditor(e.lot));
        setPhotos(
          e.photos.map((p) => ({
            id: p.id,
            url: p.thumbnailUrl ?? p.url,
            isDefect: p.isDefect,
          })),
        );
        setCustomRun(
          !(LOT_RUN_TIME_PRESETS as readonly number[]).includes(
            e.lot.runTimeMinutes / 60,
          ),
        );
      })
      .catch((failure: unknown) =>
        setLoadError(
          failure instanceof ApiError && failure.status === 404
            ? 'This lot doesn’t exist.'
            : 'This lot couldn’t be loaded.',
        ),
      )
      .finally(() => setLoading(false));
  }, [id, client]);

  const category = options?.categories.find((c) => c.id === state.categoryId);
  // Main category first, then its subcategories in a second dropdown
  // (categories are at most two levels deep).
  const mainCategoryId = category?.parentId ?? state.categoryId;
  const mainCategory = options?.categories.find((c) => c.id === mainCategoryId);
  const mainCategories = useMemo(
    () => options?.categories.filter((c) => !c.parentId) ?? [],
    [options],
  );
  // Brands linked to the main category also apply to its subcategories (a
  // Phones brand shows for iPhone), and a subcategory's brands show when
  // only the main category is chosen.
  const brandCategoryIds = useMemo(
    () =>
      new Set(
        mainCategoryId
          ? [
              mainCategoryId,
              ...(options?.categories
                .filter((c) => c.parentId === mainCategoryId)
                .map((c) => c.id) ?? []),
            ]
          : [],
      ),
    [options, mainCategoryId],
  );
  const subcategories = useMemo(
    () =>
      mainCategoryId
        ? (options?.categories.filter((c) => c.parentId === mainCategoryId) ??
          [])
        : [],
    [options, mainCategoryId],
  );
  const location = options?.locations.find((l) => l.id === state.locationId);
  const locks = editor?.locks;
  const editable = !editor || editor.locks.editable;
  const set = <K extends keyof State>(key: K, value: State[K]) => {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
    setErrors((e) => ({ ...e, [key]: '' }));
  };

  // A new category fills in its defaults (run time) and shows its fields.
  function chooseCategory(categoryId: string) {
    const next = options?.categories.find((c) => c.id === categoryId);
    setState((s) => ({
      ...s,
      categoryId,
      runTimeMinutes:
        !editor && next?.runTimeMinutes
          ? next.runTimeMinutes
          : s.runTimeMinutes,
      condition:
        next && s.condition && !next.conditions.includes(s.condition)
          ? ''
          : s.condition,
    }));
    setDirty(true);
  }

  // One save at a time: autosave, photos and the buttons share a queue.
  const enqueue = useCallback((task: () => Promise<void>) => {
    const next = queue.current.then(task, task);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  const save = useCallback(
    (reason: 'auto' | 'button') =>
      enqueue(async () => {
        const parsed = toForm(stateRef.current);
        if (!parsed.success) {
          if (reason === 'button') {
            const e: Record<string, string> = {};
            for (const issue of parsed.error.issues)
              e[String(issue.path[0])] ||= 'Fill this in.';
            setErrors(e);
            throw new Error('invalid');
          }
          return;
        }
        setSaving(true);
        try {
          const current = editorRef.current;
          const body = {
            lot: parsed.data,
            expectedUpdatedAt: current?.updatedAt ?? null,
            idempotencyKey: keyRef.current,
          };
          const next = current
            ? await client.edit(current.id, body)
            : await client.create(body);
          keyRef.current = crypto.randomUUID();
          setEditor(next);
          setDirty(false);
          setSavedAt(Date.now());
          setMessage('');
          if (!current) {
            history.replaceState(null, '', `/lots/${next.id}/edit`);
            // Photos chosen before the first save upload now.
            const waiting = photosRef.current.filter(
              (p) => p.pending && !p.failed,
            );
            for (const p of waiting) await tryUpload(next.id, p);
          }
        } catch (failure) {
          if (failure instanceof ApiError && failure.code === 'FIELD_ERROR')
            setErrors({ [failure.field ?? 'form']: failure.detail ?? '' });
          else
            setMessage(
              failure instanceof ApiError && failure.status === 409
                ? 'Someone else changed this lot. Reload the page to see their changes.'
                : 'Couldn’t save. Check your connection; your changes are still here.',
            );
          throw failure;
        } finally {
          setSaving(false);
        }
      }),
    [client, enqueue],
  );

  // Autosave as a draft every 30 seconds once the minimum fields are valid.
  useEffect(() => {
    if (!editable) return;
    const t = setInterval(() => {
      if (dirty && toForm(stateRef.current).success)
        void save('auto').catch(() => undefined);
    }, AUTOSAVE_MS);
    return () => clearInterval(t);
  }, [dirty, editable, save]);
  // Leaving with unsaved changes asks first.
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  async function leave(path: string) {
    if (
      dirty &&
      !(await confirm({
        title: 'Leave without saving?',
        message: <p>Your latest changes haven’t been saved yet.</p>,
        confirmLabel: 'Leave without saving',
        tone: 'danger',
      }))
    )
      return;
    go(path);
  }

  // ------------------------------------------------------------ photos --
  const photosRef = useRef(photos);
  photosRef.current = photos;
  async function uploadOne(lotId: string, photo: Photo) {
    if (!photo.pending) return;
    const file = photo.pending;
    const digest = await sha256(file);
    // Each tile asks for its own place in the list. A place can still be
    // held by an unfinished upload (a failed or removed photo), so try the
    // other free places before giving up.
    const index = Math.max(
      0,
      photosRef.current.findIndex((p) => p.id === photo.id),
    );
    const places = [
      index,
      ...Array.from({ length: LOT_MAX_PHOTOS }, (_, i) => i).filter(
        (i) => i !== index,
      ),
    ];
    let prepared: Awaited<ReturnType<typeof catalogue.beginUpload>> | undefined;
    for (const place of places) {
      try {
        prepared = await catalogue.beginUpload(lotId, {
          idempotencyKey: crypto.randomUUID(),
          contentType: file.type as 'image/webp',
          sizeBytes: file.size,
          sha256: digest,
          sortOrder: place,
        });
        break;
      } catch (failure) {
        if (!(failure instanceof ApiError && failure.status === 409))
          throw failure;
      }
    }
    if (!prepared) throw new Error('no free photo place');
    const put = await fetch(prepared.uploadUrl, {
      method: 'PUT',
      headers: prepared.headers,
      body: file,
    });
    if (!put.ok) throw new Error('upload');
    const done = await catalogue.completeUpload(lotId, prepared.uploadId);
    setPhotos((list) =>
      list.map((p) =>
        p.id === photo.id
          ? {
              id: done.id,
              url: done.thumbnailUrl ?? done.url ?? '',
              isDefect: false,
            }
          : p,
      ),
    );
    const fresh = await client.editor(lotId);
    setEditor(fresh);
  }
  /** Upload one photo; a failure marks the photo instead of stopping. */
  async function tryUpload(lotId: string, photo: Photo) {
    try {
      await uploadOne(lotId, photo);
      return true;
    } catch (failure) {
      const storage = failure instanceof ApiError && failure.status === 503;
      setPhotos((list) =>
        list.map((p) =>
          p.id === photo.id
            ? { ...p, failed: storage ? 'storage' : 'error' }
            : p,
        ),
      );
      setMessage(
        storage
          ? 'Photos can’t upload: image storage (Cloudflare R2) isn’t set up on this server. Ask an admin to add the R2 settings, then add the photos again.'
          : 'A photo couldn’t upload. Remove it and add it again.',
      );
      return false;
    }
  }
  function retryUpload(lotId: string, photo: Photo) {
    const again = { ...photo, failed: undefined };
    setPhotos((list) => list.map((p) => (p.id === photo.id ? again : p)));
    setMessage('');
    void enqueue(async () => {
      await tryUpload(lotId, again);
    });
  }
  async function addFiles(files: FileList | File[]) {
    const room = LOT_MAX_PHOTOS - photos.length;
    const list = Array.from(files)
      .filter((f) => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type))
      .slice(0, Math.max(0, room));
    if (!list.length) {
      setMessage(
        room <= 0
          ? `A lot can have up to ${LOT_MAX_PHOTOS} photos.`
          : 'Use JPEG, PNG or WebP photos.',
      );
      return;
    }
    const prepared: Photo[] = [];
    for (const f of list) {
      const file = await compress(f);
      prepared.push({
        id: `pending-${crypto.randomUUID()}`,
        url: URL.createObjectURL(file),
        isDefect: false,
        pending: file,
      });
    }
    setPhotos((p) => [...p, ...prepared]);
    const lotId = editorRef.current?.id;
    if (!lotId) {
      setMessage(
        'Photos upload as soon as the draft is saved (fill in the details below).',
      );
      return;
    }
    void enqueue(async () => {
      let ok = true;
      for (const p of prepared) ok = (await tryUpload(lotId, p)) && ok;
      if (ok) setMessage('');
    });
  }
  // Reorder, defect tags and removals save straight away.
  function syncPhotos(next: Photo[], removed: string[] = []) {
    setPhotos(next);
    const lotId = editorRef.current?.id;
    if (!lotId || next.some((p) => p.pending)) return;
    void enqueue(async () => {
      try {
        const current = editorRef.current;
        if (!current) return;
        const updated = await client.photos(lotId, {
          order: [...next.map((p) => p.id), ...removed],
          defects: next.filter((p) => p.isDefect).map((p) => p.id),
          remove: removed,
          expectedUpdatedAt: current.updatedAt,
        });
        setEditor(updated);
      } catch (failure) {
        setMessage(
          failure instanceof ApiError && failure.detail
            ? failure.detail
            : 'Photo changes couldn’t be saved.',
        );
      }
    });
  }

  // --------------------------------------------------------- checklist --
  const checklist = useMemo(() => {
    const items: {
      state: 'ok' | 'block' | 'warn';
      title: string;
      note: string;
    }[] = [];
    const needed = Math.max(1, category?.minPhotos ?? 1);
    const real = photos.filter((p) => !p.pending).length;
    const failed = photos.filter((p) => p.failed).length;
    const waiting = photos.filter((p) => p.pending && !p.failed).length;
    items.push(
      real >= needed
        ? {
            state: 'ok',
            title: `${real} ${real === 1 ? 'photo' : 'photos'}`,
            note: `minimum ${needed}`,
          }
        : failed
          ? {
              state: 'block',
              title: `${failed} ${failed === 1 ? 'photo' : 'photos'} not uploaded`,
              note: `${real} of ${needed} minimum uploaded · see the message under Photos`,
            }
          : waiting
            ? {
                state: 'block',
                title: `${waiting} ${waiting === 1 ? 'photo' : 'photos'} waiting to upload`,
                note: editor
                  ? `${real} of ${needed} minimum uploaded so far`
                  : 'They upload when the draft is first saved: fill in the details below',
              }
            : {
                state: 'block',
                title: `Add at least ${needed - real} more ${needed - real === 1 ? 'photo' : 'photos'}`,
                note: `${real} of ${needed} minimum · show front, back and the label`,
              },
    );
    items.push(
      state.title && state.categoryId
        ? {
            state: 'ok',
            title: 'Title and category set',
            note: `${state.title} · ${category?.name ?? ''}`,
          }
        : {
            state: 'block',
            title: 'Add a title and category',
            note: 'Buyers search by both',
          },
    );
    items.push(
      !state.condition
        ? {
            state: 'block',
            title: 'Choose a condition',
            note: 'Add defects if there are any',
          }
        : category && !category.conditions.includes(state.condition)
          ? {
              state: 'block',
              title: 'Pick a condition this category allows',
              note: conditionLabel(state.condition),
            }
          : {
              state: 'ok',
              title: 'Condition set',
              note: `${conditionLabel(state.condition)}${state.defects.length ? ` · ${state.defects.length} defects listed` : ''}`,
            },
    );
    items.push(
      !state.startPriceKobo
        ? {
            state: 'block',
            title: 'Set a start price',
            note: state.retailPriceKobo
              ? `Retail estimate ${formatNaira(state.retailPriceKobo)} is set`
              : 'Bidding starts here',
          }
        : category?.minStartPriceKobo &&
            state.startPriceKobo < category.minStartPriceKobo
          ? {
              state: 'block',
              title: 'Raise the start price',
              note: `${category.name} starts at ${formatNaira(category.minStartPriceKobo)}`,
            }
          : {
              state: 'ok',
              title: 'Start price set',
              note: `${formatNaira(state.startPriceKobo)}${state.retailPriceKobo ? ` · retail ${formatNaira(state.retailPriceKobo)}` : ''}`,
            },
    );
    const missing = (category?.fields ?? []).filter(
      (f) =>
        f.required &&
        (state.details[f.key] === undefined || state.details[f.key] === '') &&
        !(f.key === 'brand' && state.brandId),
    );
    if (category?.fields.length)
      items.push(
        missing.length
          ? {
              state: 'block',
              title: `Fill in ${missing.map((f) => f.name).join(', ')}`,
              note: 'Required by this category',
            }
          : {
              state: 'ok',
              title: 'Item details filled in',
              note: `${category.fields.length} fields`,
            },
      );
    items.push(
      state.binId
        ? {
            state: 'ok',
            title: 'Hub and bin set',
            note: `${location?.name ?? ''} · ${location?.bins.find((b) => b.id === state.binId)?.code ?? ''}`,
          }
        : location?.binRequiredToPublish
          ? {
              state: 'block',
              title: 'Put this lot in a bin',
              note: `${location.name} needs a bin before publishing`,
            }
          : {
              state: 'warn',
              title: 'Bin not set yet',
              note: 'Needed before pickup, not to publish',
            },
    );
    if (state.defects.length && !photos.some((p) => p.isDefect))
      items.push({
        state: 'warn',
        title: 'No photo shows the defects',
        note: 'Tag a photo as Defect so buyers see it',
      });
    return items;
  }, [state, category, location, photos, editor]);
  const blocking = checklist.filter((c) => c.state === 'block').length;
  const uploading = photos.some((p) => p.pending);
  // Only drafts (or a brand-new lot) are published from here; scheduled and
  // live lots are managed in the Live monitor and Auctions.
  const canOfferPublish = !!publish && (!editor || editor.stage === 'draft');
  async function openPublish(mode: 'now' | 'later') {
    try {
      // Save first so the published lot is exactly what's on screen.
      if (dirty || !editorRef.current) await save('button');
      setPublishing(mode);
    } catch {
      // save() already shows what to fix.
    }
  }

  if (loading)
    return (
      <div
        className="lv-lots-skeleton"
        aria-busy="true"
        aria-label="Loading lot"
      />
    );
  if (loadError)
    return (
      <div className="lv-lots-card lv-lots-state" role="alert">
        <p>{loadError}</p>
        <Button variant="secondary" onClick={() => go('/lots')}>
          Back to lots
        </Button>
      </div>
    );

  const statusText = saving
    ? 'Saving…'
    : dirty
      ? 'Unsaved changes'
      : savedAt
        ? `Saved ${wat.dateTime(new Date(savedAt).toISOString())}`
        : editor
          ? 'All changes saved'
          : 'New · not saved';
  const cover = photos[0];
  const endPreview = new Date(
    now + state.runTimeMinutes * 60_000,
  ).toISOString();
  const runLocked = !!locks?.runTimeLocked;
  const priceLocked = !!locks?.priceLocked;

  return (
    <div className="lv-lots">
      {dialog}
      {publishing && publish && editor && (
        <PublishDialog
          lotNumber={editor.lotNumber}
          runTimeMinutes={state.runTimeMinutes}
          initial={publishing}
          onClose={() => setPublishing(undefined)}
          publish={async (request) => {
            // The newest version stamp: autosave may have run meanwhile.
            const latest = await client.editor(editor.id);
            await publish(editor.id, latest.updatedAt, request);
            setPublishing(undefined);
            setDirty(false);
            go(`/lots/${editor.id}`);
          }}
        />
      )}
      <p className="lv-lots-crumb">
        <button type="button" onClick={() => void leave('/lots')}>
          Lots
        </button>{' '}
        › {editor ? editor.lotNumber : 'New lot'}
      </p>
      <header className="lv-lots-head">
        <div>
          <h1>{editor ? `Edit ${editor.lotNumber}` : 'Create lot'}</h1>
          <p>
            <span
              className="lv-lot-status"
              data-tone={
                dirty ? 'dirty' : savedAt || editor ? 'saved' : undefined
              }
            >
              {statusText}
            </span>
            {' · '}
            {editor
              ? 'Autosaved as a draft every 30 seconds'
              : 'The lot ID is given when you save · autosaved as a draft every 30 seconds'}
          </p>
        </div>
      </header>
      {locks?.reason && (
        <p className="lv-lots-notice" role="note">
          <TriangleAlert size={18} aria-hidden="true" />
          {locks.reason}
        </p>
      )}
      {message && (
        <p className="lv-lots-notice" role="status">
          <TriangleAlert size={18} aria-hidden="true" />
          {message}
        </p>
      )}
      {errors.form && (
        <p className="lv-lots-error" role="alert">
          {errors.form}
        </p>
      )}

      <div className="lv-lot-form">
        <div className="lv-lot-form-main">
          <section
            className="lv-lots-card lv-lot-section"
            aria-labelledby="photos-h"
          >
            <header>
              <h2 id="photos-h">Photos</h2>
              <small>
                {photos.length} of {LOT_MAX_PHOTOS} · first photo is the cover ·
                drag to reorder
              </small>
            </header>
            <div className="lv-lot-photos">
              {photos.map((p, i) => (
                <div
                  key={p.id}
                  className="lv-lot-photo"
                  draggable={editable && !p.pending}
                  data-dragging={dragIndex === i || undefined}
                  onDragStart={() => setDragIndex(i)}
                  onDragEnd={() => setDragIndex(undefined)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex === undefined || dragIndex === i) return;
                    const next = [...photos];
                    const [moved] = next.splice(dragIndex, 1);
                    if (moved) next.splice(i, 0, moved);
                    syncPhotos(next);
                  }}
                >
                  <img
                    src={p.pending ? p.url : productImageSource(p.url)}
                    alt={`Photo ${i + 1}`}
                  />
                  {i === 0 && <span className="lv-lot-cover-tag">Cover</span>}
                  {p.pending && p.failed && editor && editable ? (
                    <button
                      type="button"
                      className="lv-lot-photo-state"
                      data-failed=""
                      title={
                        p.failed === 'storage'
                          ? 'Image storage isn’t set up on this server. Try again once it is.'
                          : 'Upload failed. Try again.'
                      }
                      onClick={() => retryUpload(editor.id, p)}
                    >
                      Not uploaded · Retry
                    </button>
                  ) : (
                    p.pending && (
                      <span
                        className="lv-lot-photo-state"
                        data-failed={p.failed ? '' : undefined}
                      >
                        {p.failed
                          ? 'Not uploaded'
                          : editor
                            ? 'Uploading…'
                            : 'Uploads on save'}
                      </span>
                    )
                  )}
                  {editable && (
                    <span className="lv-lot-photo-tools">
                      <button
                        type="button"
                        aria-pressed={p.isDefect}
                        title="Mark this photo as showing a defect"
                        onClick={() =>
                          syncPhotos(
                            photos.map((x) =>
                              x.id === p.id
                                ? { ...x, isDefect: !x.isDefect }
                                : x,
                            ),
                          )
                        }
                      >
                        Defect
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove photo ${i + 1}`}
                        onClick={() =>
                          p.pending
                            ? setPhotos(photos.filter((x) => x.id !== p.id))
                            : syncPhotos(
                                photos.filter((x) => x.id !== p.id),
                                [p.id],
                              )
                        }
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </span>
                  )}
                </div>
              ))}
              {editable && photos.length < LOT_MAX_PHOTOS && (
                <label
                  className="lv-lot-addphoto"
                  data-over={dropOver || undefined}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropOver(true);
                  }}
                  onDragLeave={() => setDropOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropOver(false);
                    if (e.dataTransfer.files.length)
                      void addFiles(e.dataTransfer.files);
                  }}
                >
                  <Plus size={22} aria-hidden="true" />
                  <strong>Add photos</strong>
                  <small>or drag files here</small>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="sr-only"
                    onChange={(e) =>
                      e.target.files && void addFiles(e.target.files)
                    }
                  />
                </label>
              )}
            </div>
            <p className="lv-lot-hint">
              At least {Math.max(1, category?.minPhotos ?? 3)} photos: front,
              back, any damage and the label. Mark photos that show a defect so
              buyers see them.
            </p>
          </section>

          <section
            className="lv-lots-card lv-lot-section"
            aria-labelledby="details-h"
          >
            <header>
              <h2 id="details-h">Item details</h2>
            </header>
            <Input
              label="Title buyers will see"
              value={state.title}
              maxLength={LOT_TITLE_MAX}
              disabled={!editable}
              hint={`Brand, model, size or capacity, colour. ${LOT_TITLE_MAX} characters max.`}
              error={errors.title}
              onChange={(e) => set('title', e.target.value)}
            />
            <div className="lv-lot-grid2">
              <Select
                label="Category"
                value={mainCategoryId}
                disabled={!editable || !!locks?.categoryLocked}
                error={subcategories.length ? undefined : errors.categoryId}
                onChange={(e) => chooseCategory(e.target.value)}
              >
                <option value="">Choose a category</option>
                {mainCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              {subcategories.length > 0 && (
                <Select
                  label="Subcategory (optional)"
                  value={category?.parentId ? state.categoryId : ''}
                  disabled={!editable || !!locks?.categoryLocked}
                  error={errors.categoryId}
                  onChange={(e) =>
                    chooseCategory(e.target.value || mainCategoryId)
                  }
                >
                  <option value="">
                    None, keep it in {mainCategory?.name ?? 'this category'}
                  </option>
                  {subcategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
              <Select
                label="Brand"
                value={state.brandId ?? ''}
                disabled={!editable}
                error={errors.brandId}
                onChange={(e) => set('brandId', e.target.value || null)}
              >
                <option value="">No brand</option>
                {options?.brands
                  .filter(
                    (b) =>
                      !b.categoryIds.length ||
                      b.categoryIds.some((id) => brandCategoryIds.has(id)),
                  )
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </Select>
            </div>
            <fieldset
              className="lv-lot-section"
              style={{ padding: 0, border: 0, margin: 0 }}
            >
              <legend
                className="agn-label"
                style={{ fontWeight: 600, marginBottom: 8 }}
              >
                Condition
              </legend>
              <div className="lv-lot-conditions">
                {databaseValues.lotConditions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={state.condition === c}
                    disabled={
                      !editable ||
                      (!!category && !category.conditions.includes(c))
                    }
                    onClick={() => set('condition', c)}
                  >
                    <ConditionBadge condition={c} />
                    <small>{conditionHint[c]}</small>
                  </button>
                ))}
              </div>
              {errors.condition && (
                <p className="lv-lots-error">{errors.condition}</p>
              )}
            </fieldset>
            <Textarea
              label="Description"
              value={state.description}
              rows={8}
              disabled={!editable}
              placeholder="What it is, what works, what doesn’t. Plain words, no hype."
              onChange={(e) => set('description', e.target.value)}
            />
            {errors.description && (
              <p className="lv-lots-error">{errors.description}</p>
            )}
            <div className="lv-lot-grid2">
              <TagEditor
                label="What’s included"
                value={state.included}
                disabled={!editable}
                onChange={(v) => set('included', v)}
              />
              <TagEditor
                label="Missing or defects"
                value={state.defects}
                defects
                disabled={!editable}
                onChange={(v) => set('defects', v)}
              />
            </div>
            {category && category.fields.length > 0 && (
              <div className="lv-lot-grid2">
                {category.fields.map((f) => {
                  const v = state.details[f.key];
                  const change = (
                    value: string | number | boolean | undefined,
                  ) => {
                    const next = { ...state.details };
                    if (value === undefined || value === '') delete next[f.key];
                    else next[f.key] = value;
                    set('details', next);
                  };
                  const label = `${f.name}${f.required ? '' : ' (optional)'}`;
                  return f.type === 'list' ? (
                    <Select
                      key={f.key}
                      label={label}
                      value={String(v ?? '')}
                      disabled={!editable}
                      onChange={(e) => change(e.target.value)}
                    >
                      <option value="">Choose</option>
                      {f.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  ) : f.type === 'boolean' ? (
                    <Select
                      key={f.key}
                      label={label}
                      value={v === undefined ? '' : v ? 'yes' : 'no'}
                      disabled={!editable}
                      onChange={(e) =>
                        change(
                          e.target.value === ''
                            ? undefined
                            : e.target.value === 'yes',
                        )
                      }
                    >
                      <option value="">Choose</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </Select>
                  ) : (
                    <Input
                      key={f.key}
                      label={label}
                      inputMode={f.type === 'number' ? 'decimal' : undefined}
                      value={v === undefined ? '' : String(v)}
                      disabled={!editable}
                      hint={f.helpText ?? undefined}
                      onChange={(e) =>
                        change(
                          f.type === 'number' &&
                            e.target.value !== '' &&
                            Number.isFinite(Number(e.target.value))
                            ? Number(e.target.value)
                            : e.target.value,
                        )
                      }
                    />
                  );
                })}
              </div>
            )}
          </section>

          <section
            className="lv-lots-card lv-lot-section"
            aria-labelledby="price-h"
          >
            <header>
              <h2 id="price-h">Price</h2>
              {priceLocked && <span className="lv-lot-locked">Locked</span>}
            </header>
            <div className="lv-lot-grid2">
              <NairaInput
                key={`start-${editor?.id ?? 'new'}`}
                label="Start price (₦)"
                initialValue={
                  state.startPriceKobo ? String(state.startPriceKobo / 100) : ''
                }
                disabled={!editable || priceLocked}
                hint="Bidding starts here. Bid steps follow Fees and rules."
                error={errors.startPriceKobo}
                onAmountChange={(k) => set('startPriceKobo', k)}
              />
              <NairaInput
                key={`retail-${editor?.id ?? 'new'}`}
                label="Retail estimate (₦)"
                initialValue={
                  state.retailPriceKobo
                    ? String(state.retailPriceKobo / 100)
                    : ''
                }
                disabled={!editable || priceLocked}
                hint="Shown crossed out on the lot card."
                error={errors.retailPriceKobo}
                onAmountChange={(k) => set('retailPriceKobo', k)}
              />
            </div>
          </section>

          <section
            className="lv-lots-card lv-lot-section"
            aria-labelledby="loc-h"
          >
            <header>
              <h2 id="loc-h">Location and source</h2>
            </header>
            <div className="lv-lot-grid2">
              <Select
                label="Pickup hub"
                value={state.locationId}
                disabled={!editable || !!locks?.locationLocked}
                error={errors.locationId}
                onChange={(e) => {
                  set('locationId', e.target.value);
                  set('binId', null);
                }}
              >
                <option value="">Choose a pickup location</option>
                {options?.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · {l.code}
                  </option>
                ))}
              </Select>
              <BinPicker
                location={location}
                value={state.binId}
                disabled={!editable}
                error={errors.binId}
                onChange={(v) => set('binId', v)}
              />
              <Select
                label="Supplier (optional)"
                value={state.supplierId ?? ''}
                disabled={!editable}
                error={errors.supplierId}
                onChange={(e) => set('supplierId', e.target.value || null)}
                hint="Batches and unit cost come with Inventory batches."
              >
                <option value="">No supplier</option>
                {options?.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </section>
        </div>

        <aside className="lv-lot-form-rail">
          <section
            className="lv-lots-card lv-lot-section"
            aria-labelledby="run-h"
          >
            <header>
              <h2 id="run-h">Run time</h2>
              {category?.runTimeMinutes && (
                <small>
                  Category default: {hoursLabel(category.runTimeMinutes)}
                </small>
              )}
            </header>
            <div className="lv-lot-runtimes" role="group" aria-label="Run time">
              {LOT_RUN_TIME_PRESETS.map((h) => (
                <button
                  key={h}
                  type="button"
                  disabled={!editable || runLocked}
                  aria-pressed={!customRun && state.runTimeMinutes === h * 60}
                  onClick={() => {
                    setCustomRun(false);
                    set('runTimeMinutes', h * 60);
                  }}
                >
                  {h} h
                </button>
              ))}
              <button
                type="button"
                disabled={!editable || runLocked}
                aria-pressed={customRun}
                onClick={() => setCustomRun(true)}
              >
                Custom
              </button>
            </div>
            {customRun && (
              <Input
                label="Hours (1 to 168)"
                inputMode="numeric"
                disabled={!editable || runLocked}
                value={String(state.runTimeMinutes / 60)}
                onChange={(e) => {
                  const h = Math.min(
                    168,
                    Math.max(
                      1,
                      Math.round(
                        Number(e.target.value.replace(/\D/g, '')) || 1,
                      ),
                    ),
                  );
                  set('runTimeMinutes', h * 60);
                }}
              />
            )}
            {(!editor || editor.stage === 'draft') && (
              <div className="lv-lot-preview-end">
                <span>
                  If published now ({wat.dayTime(new Date(now).toISOString())}),
                  it ends
                </span>
                <strong>{wat.dateTime(endPreview)}</strong>
                <span>
                  Countdown starts the moment you publish. Run time locks once
                  the lot is scheduled or gets bids.
                </span>
              </div>
            )}
            {canOfferPublish && (
              <div className="lv-lot-publishbar">
                <div className="lv-lot-publishbtns">
                  <Button
                    disabled={!editable || saving || blocking > 0 || uploading}
                    onClick={() => void openPublish('now')}
                  >
                    <Send size={16} aria-hidden="true" /> Publish
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!editable || saving || blocking > 0 || uploading}
                    onClick={() => void openPublish('later')}
                  >
                    <CalendarClock size={16} aria-hidden="true" /> Schedule
                  </Button>
                </div>
                <small>
                  {blocking > 0
                    ? `Finish the ${blocking} ${blocking === 1 ? 'item' : 'items'} in Ready to publish first.`
                    : uploading
                      ? 'Wait for the photos to finish uploading.'
                      : 'Publish goes live in about a minute; Schedule picks a time. Both save your changes first.'}
                </small>
              </div>
            )}
            <div className="lv-lot-savebar">
              <Button
                variant={canOfferPublish ? 'secondary' : 'primary'}
                busy={saving}
                disabled={!editable}
                onClick={() =>
                  void save('button')
                    .then(() => {
                      const lotId = editorRef.current?.id;
                      if (lotId) go(`/lots/${lotId}`);
                    })
                    .catch(() => undefined)
                }
              >
                {editor && editor.stage !== 'draft'
                  ? 'Save changes'
                  : 'Save as draft'}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void leave(editor ? `/lots/${editor.id}` : '/lots')
                }
              >
                Cancel
              </Button>
            </div>
            {locks?.tellBuyers && (
              <p className="lv-lot-hint">
                Bidders and watchers get a “lot details updated” message when
                you save.
              </p>
            )}
          </section>

          <section
            className="lv-lots-card lv-lot-section"
            aria-labelledby="ready-h"
          >
            <header>
              <h2 id="ready-h">Ready to publish?</h2>
              <small>{blocking ? `${blocking} to finish` : 'All set'}</small>
            </header>
            <ul className="lv-lot-check">
              {checklist.map((c) => (
                <li key={c.title} data-state={c.state}>
                  <span aria-hidden="true">
                    {c.state === 'ok' ? '✓' : c.state === 'block' ? '×' : '!'}
                  </span>
                  <span>{c.title}</span>
                  <small>{c.note}</small>
                </li>
              ))}
            </ul>
            <p className="lv-lot-hint">
              Hard rules (×) block publishing; warnings (!) don’t.
            </p>
          </section>

          <section
            className="lv-lots-card lv-lot-section"
            aria-labelledby="preview-h"
          >
            <header>
              <h2 id="preview-h">How buyers will see it</h2>
            </header>
            <div className="lv-lot-buyercard">
              <div>
                {cover ? (
                  <img
                    src={
                      cover.pending ? cover.url : productImageSource(cover.url)
                    }
                    alt=""
                  />
                ) : (
                  <Camera size={36} aria-hidden="true" />
                )}
                <DiscountBadge
                  priceKobo={state.startPriceKobo || undefined}
                  retailKobo={state.retailPriceKobo || undefined}
                />
              </div>
              <p>
                <strong>{state.title || 'Title buyers will see'}</strong>
              </p>
              <p>
                <strong>
                  {state.startPriceKobo
                    ? formatNaira(state.startPriceKobo)
                    : '₦—'}
                </strong>{' '}
                {state.retailPriceKobo ? (
                  <s>{formatNaira(state.retailPriceKobo)}</s>
                ) : null}
              </p>
              <p>0 bids · {hoursLabel(state.runTimeMinutes)}</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function TagEditor({
  label,
  value,
  onChange,
  disabled,
  defects = false,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  disabled: boolean;
  defects?: boolean;
}) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (t && !value.includes(t) && value.length < 20) onChange([...value, t]);
    setText('');
  };
  return (
    <div className="agn-field">
      <span className="agn-label" style={{ fontWeight: 600 }}>
        {label}
      </span>
      <div className="lv-lot-tagedit" data-defects={defects || undefined}>
        {value.map((t) => (
          <span key={t}>
            {t}
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove ${t}`}
                onClick={() => onChange(value.filter((x) => x !== t))}
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            aria-label={`Add to ${label}`}
            placeholder="+ Add"
            value={text}
            maxLength={60}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
          />
        )}
      </div>
    </div>
  );
}

/** Bin dropdown for the chosen location, or scan its QR label (LVBIN:code:bin). */
function BinPicker({
  location,
  value,
  onChange,
  disabled,
  error,
}: {
  location: LotSetupOptions['locations'][number] | undefined;
  value: string | null;
  onChange: (v: string | null) => void;
  disabled: boolean;
  error?: string;
}) {
  const [scan, setScan] = useState('');
  const [scanError, setScanError] = useState('');
  const chosen = location?.bins.find((b) => b.id === value);
  return (
    <div className="agn-field">
      <Select
        label="Bin (optional)"
        value={value ?? ''}
        disabled={disabled || !location}
        error={error}
        hint={
          !location
            ? 'Choose a pickup location first.'
            : chosen?.capacity
              ? `${chosen.held} of ${chosen.capacity} items${chosen.full ? ' · full, staff can still use it' : ''}`
              : undefined
        }
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">No bin yet</option>
        {location?.bins.map((b) => (
          <option key={b.id} value={b.id}>
            {b.code}
            {b.capacity
              ? ` · ${b.held}/${b.capacity}${b.full ? ' · full' : ''}`
              : ''}
          </option>
        ))}
      </Select>
      {location && !disabled && (
        <Input
          label="Or scan the bin label"
          value={scan}
          placeholder="Scan or type, e.g. S-01"
          error={scanError}
          onChange={(e) => {
            setScan(e.target.value);
            setScanError('');
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const parts = scan.trim().toUpperCase().split(':');
            const code = parts[0] === 'LVBIN' ? parts[2] : parts.at(-1);
            if (
              parts[0] === 'LVBIN' &&
              parts[1] !== location.code.toUpperCase()
            ) {
              setScanError(`That bin is at another location (${parts[1]}).`);
              return;
            }
            const bin = location.bins.find(
              (b) => b.code.toUpperCase() === code,
            );
            if (!bin) setScanError('No bin with that name at this location.');
            else {
              onChange(bin.id);
              setScan('');
            }
          }}
        />
      )}
    </div>
  );
}
