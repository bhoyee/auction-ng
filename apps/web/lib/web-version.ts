import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function readWebVersion() {
  try {
    return (
      await readFile(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8')
    ).trim();
  } catch {
    return 'development';
  }
}
