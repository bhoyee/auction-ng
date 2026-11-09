import { readWebVersion } from '../../../lib/web-version';

export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json(
    { version: await readWebVersion() },
    {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  );
}
