import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Einfache PIN-Sperre für die Entwicklungsphase. Die PIN liegt nur auf dem Server (APP_PIN),
 * nach richtiger Eingabe gibt es ein Cookie, das 90 Tage gilt.
 */

const COOKIE = 'rechase_pin';
const MAX_AGE_S = 90 * 24 * 3600;
const MAX_TRIES = 10;
const LOCK_MS = 15 * 60 * 1000;

// Holt der Browser ohne Cookies (Manifest) oder braucht der Healthcheck; nichts davon ist vertraulich.
const PUBLIC_PATHS = new Set([
  '/healthz',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
]);

export interface PinGate {
  /** true: Anfrage ist erledigt (Formular, Login oder Ablehnung), false: normal weitermachen */
  handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean>;
}

export function createPinGate(pin: string, now: () => number = Date.now): PinGate {
  // Wechselt die PIN, sind alle alten Cookies ungültig.
  const token = createHmac('sha256', pin).update('rechase-pin-v1').digest('base64url');
  const tries = new Map<string, { count: number; since: number }>();

  const same = (a: string, b: string) => {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  };

  function hasCookie(req: IncomingMessage) {
    for (const part of (req.headers.cookie ?? '').split(';')) {
      const [k, v] = part.trim().split('=');
      if (k === COOKIE && v && same(v, token)) return true;
    }
    return false;
  }

  // Der Port hängt nur an 127.0.0.1, davor sitzt nginx und setzt X-Forwarded-For auf die echte Adresse.
  const clientIp = (req: IncomingMessage) =>
    String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '?';

  function locked(ip: string) {
    const t = tries.get(ip);
    if (!t) return false;
    if (now() - t.since > LOCK_MS) {
      tries.delete(ip);
      return false;
    }
    return t.count >= MAX_TRIES;
  }

  function fail(ip: string) {
    const t = tries.get(ip);
    if (!t || now() - t.since > LOCK_MS) tries.set(ip, { count: 1, since: now() });
    else t.count++;
    if (tries.size > 10_000) tries.clear();
  }

  async function readBody(req: IncomingMessage) {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 1024) break;
    }
    return body;
  }

  function sendForm(res: ServerResponse, status: number, message = '') {
    res.writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
    });
    res.end(formHtml(message));
  }

  return {
    async handle(req, res, url) {
      if (PUBLIC_PATHS.has(url.pathname)) return false;

      if (url.pathname === '/pin' && req.method === 'POST') {
        const ip = clientIp(req);
        if (locked(ip)) {
          sendForm(res, 429, 'Zu viele Versuche. Bitte in 15 Minuten erneut probieren.');
          return true;
        }
        const entered = new URLSearchParams(await readBody(req)).get('pin')?.trim() ?? '';
        if (!same(entered, pin)) {
          fail(ip);
          sendForm(res, 401, 'Falsche PIN.');
          return true;
        }
        tries.delete(ip);
        const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
        res.writeHead(303, {
          Location: '/',
          'Set-Cookie': `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE_S}; HttpOnly; SameSite=Lax${secure}`,
          'Cache-Control': 'no-store',
        });
        res.end();
        return true;
      }

      if (hasCookie(req)) return false;

      // Ohne Cookie bliebe ein installierter Service Worker für immer auf seiner alten Version und zeigte
      // nie das PIN-Formular. Statt eines 401 bekommt er einen Ersatz, der sich abmeldet und neu lädt.
      if (url.pathname === '/sw.js') {
        res.writeHead(200, {
          'Content-Type': 'text/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(UNREGISTER_SW);
        return true;
      }

      // Seitenaufrufe bekommen das Formular, alles andere (Skripte, Service Worker) nur ein 401.
      const wantsPage = req.method === 'GET' && (req.headers.accept ?? '').includes('text/html');
      if (wantsPage) sendForm(res, 401);
      else res.writeHead(401, { 'Cache-Control': 'no-store' }).end();
      return true;
    },
  };
}

const UNREGISTER_SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration
      .unregister()
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => Promise.all(clients.map((c) => c.navigate(c.url)))),
  );
});
`;

const escapeHtml =(s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function formHtml(message: string) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0D0F12">
<meta name="robots" content="noindex">
<title>re:chase</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px;
    background: #0D0F12; color: #F2F4F7; font-family: system-ui, sans-serif; }
  form { width: 100%; max-width: 320px; display: flex; flex-direction: column; gap: 14px; }
  h1 { margin: 0; font-size: 28px; font-weight: 700; }
  p { margin: 0; color: #9AA3AF; font-size: 15px; }
  input { height: 64px; border-radius: 14px; border: 1.5px solid #2E333B; background: #171A1F; color: #F2F4F7;
    font-size: 32px; letter-spacing: 0.4em; text-align: center; }
  input:focus { outline: none; border-color: #FF7A1A; }
  button { height: 56px; border: 0; border-radius: 14px; background: #FF7A1A; color: #0D0F12;
    font-size: 17px; font-weight: 700; }
  .error { color: #FFB4AE; }
</style>
</head>
<body>
<form method="post" action="/pin">
  <h1>re:chase</h1>
  <p>Noch in Entwicklung. Bitte PIN eingeben.</p>
  <input name="pin" type="password" inputmode="numeric" autocomplete="off" aria-label="PIN" required autofocus>
  ${message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : ''}
  <button type="submit">Weiter</button>
</form>
</body>
</html>
`;
}
