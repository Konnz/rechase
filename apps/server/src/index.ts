import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
const publicDir = process.env.PUBLIC_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'public');
const version = process.env.APP_VERSION ?? 'dev';

const server = createApp({ publicDir, version }).listen(port, () => {
  console.log(`re:chase ${version} lauscht auf Port ${port}`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
