'use client';
import { useRef } from 'react';
import { BATCH_FILE_MAX_BYTES, BATCH_MAX_FILES } from '@auction-ng/shared';
import type { BatchesClient } from '@auction-ng/api-client/batches';
import { Button } from '@auction-ng/ui/web/button';
import { Upload } from '@auction-ng/ui/web/icons';

/** "Attach the supplier's invoice and item list". */
export function FilePicker({
  busy,
  disabled,
  onFiles,
}: {
  busy?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="lv-batch-drop">
      <Upload size={20} aria-hidden="true" />
      <span>
        <b>Attach the supplier’s invoice and item list</b>
        <small>PDF, photo or Excel · up to {BATCH_MAX_FILES} files</small>
      </span>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-label="Attach files"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
      <Button
        variant="secondary"
        size="small"
        busy={busy}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        Choose files
      </Button>
    </div>
  );
}

class BatchFileError extends Error {
  override name = 'BatchFileError';
}
const base64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new BatchFileError('A file can’t be read.'));
    reader.readAsDataURL(file);
  });
// One key per chosen file, so trying again after a lost connection never
// attaches it twice.
const keys = new WeakMap<File, string>();
export async function uploadFiles(
  client: BatchesClient,
  batchId: string,
  files: File[],
) {
  const large = files.find((f) => f.size > BATCH_FILE_MAX_BYTES || !f.size);
  if (large)
    throw new BatchFileError(`${large.name} must be under 5 MB and not empty.`);
  for (const file of files) {
    const key = keys.get(file) ?? crypto.randomUUID();
    keys.set(file, key);
    await client.addFile(batchId, {
      name: file.name.slice(-120),
      content: await base64(file),
      idempotencyKey: key,
    });
  }
}
