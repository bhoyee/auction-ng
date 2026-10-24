import { createApi } from './app';

async function main() {
  const app = await createApi();
  await app.listen(Number(process.env.API_PORT ?? 4000), '0.0.0.0');
}

main().catch(() => {
  console.error(
    'API startup failed. Check configuration and port availability.',
  );
  process.exitCode = 1;
});
