import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

// Expose only signed webhook traffic; never tunnel the whole local application.
export function createWebhookRelay(upstream = 'http://127.0.0.1:4000') {
  const origin = new URL(upstream);
  if (
    origin.protocol !== 'http:' ||
    !['localhost', '127.0.0.1'].includes(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw Error('The webhook relay requires a local HTTP API origin.');
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    const reply = (status: number) =>
      response
        .writeHead(status)
        .end(
          JSON.stringify(
            status === 200 ? { received: true } : { received: false },
          ),
        );
    if (request.method !== 'POST' || request.url !== '/payments/webhook') {
      reply(404);
      return;
    }
    const signature = request.headers['x-paystack-signature'];
    if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/i.test(signature)) {
      reply(401);
      return;
    }
    if (
      !/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')
    ) {
      reply(415);
      return;
    }
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        const buffer = Buffer.from(chunk);
        size += buffer.length;
        if (size > 102400) {
          reply(413);
          return;
        }
        chunks.push(buffer);
      }
      const result = await fetch(new URL('/payments/webhook', origin), {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          'x-paystack-signature': signature,
        },
        body: Buffer.concat(chunks),
        signal: AbortSignal.timeout(25000),
      });
      await result.body?.cancel();
      reply(
        result.status === 200
          ? 200
          : result.status >= 400 && result.status <= 599
            ? result.status
            : 502,
      );
    } catch {
      if (!response.headersSent) reply(502);
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = createWebhookRelay();
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.on('error', () => {
    console.error(
      'Webhook relay could not start. Check that port 4050 is free.',
    );
    process.exitCode = 1;
  });
  server.listen(4050, '127.0.0.1', () =>
    console.log(
      'Webhook-only relay listening on http://127.0.0.1:4050/payments/webhook',
    ),
  );
}
