import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { openStore } from './store.ts';

const port = Number(process.env.PORT ?? 3000);
const publicDir = process.env.PUBLIC_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'public');
const version = process.env.APP_VERSION ?? 'dev';
const pin = process.env.APP_PIN?.trim() || undefined;
// Im Container liegt /data in einem Volume, lokal reicht ./data
const dataDir = process.env.DATA_DIR ?? 'data';
const store = openStore(join(dataDir, 'rechase.db'));
const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const google = clientId && clientSecret ? { clientId, clientSecret } : undefined;
const publicUrl = process.env.PUBLIC_URL?.trim() || undefined;
const stravaId = process.env.STRAVA_CLIENT_ID?.trim();
const stravaSecret = process.env.STRAVA_CLIENT_SECRET?.trim();
const strava = stravaId && stravaSecret ? { clientId: stravaId, clientSecret: stravaSecret } : undefined;
const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').filter((e) => e.trim());

const server = createApp({ publicDir, version, pin, store, google, publicUrl, adminEmails, strava }).listen(port, () => {
  const extras = [
    pin && 'PIN-Sperre aktiv',
    google && 'Google-Anmeldung aktiv',
    strava && 'Strava aktiv',
    adminEmails.length && `${adminEmails.length} Admin${adminEmails.length === 1 ? '' : 's'}`,
  ].filter(Boolean).join(', ');
  console.log(`re:chase ${version} lauscht auf Port ${port}${extras ? ` (${extras})` : ''}`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
}
