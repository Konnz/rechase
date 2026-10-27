import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { createAccounts, type GoogleConfig } from './accounts.ts';
import { createPinGate } from './pin.ts';
import type { Store } from './store.ts';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // GPS ja, alles andere nicht
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
};

export interface AppOptions {
  publicDir: string;
  version: string;
  /** Wenn gesetzt, ist die App nur nach Eingabe dieser PIN erreichbar. */
  pin?: string;
  /** Konten-Datenbank; ohne sie gibt es keine API */
  store?: Store;
  google?: GoogleConfig;
  publicUrl?: string;
}

/** Liefert die gebaute PWA aus und beantwortet die API unter /api. */
export function createApp({ publicDir, version, pin, store, google, publicUrl }: AppOptions) {
  const root = resolve(publicDir);
  const gate = pin ? createPinGate(pin) : null;
  const accounts = store ? createAccounts({ store, google, publicUrl }) : null;

  async function sendFile(res: ServerResponse, path: string, cache: string) {
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) return false;
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': cache,
    });
    createReadStream(path).pipe(res);
    return true;
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, version }));
      return;
    }

    if (gate && (await gate.handle(req, res, url))) return;

    if (accounts && (await accounts.handle(req, res, url))) return;
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"Keine API"}');
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }

    let path: string;
    try {
      path = normalize(join(root, decodeURIComponent(url.pathname)));
    } catch {
      path = '';
    }
    if (!path.startsWith(root + sep)) {
      res.writeHead(400).end();
      return;
    }

    // Gehashte Dateien unter /assets dürfen ewig gecacht werden, alles andere (index.html, sw.js, Manifest) nie.
    const immutable = url.pathname.startsWith('/assets/');
    const cache = immutable ? 'public, max-age=31536000, immutable' : 'no-cache';
    if (await sendFile(res, path, cache)) return;

    // Unbekannte Pfade ohne Dateiendung gehören zur App (Client-Routing).
    if (!extname(url.pathname) && (await sendFile(res, join(root, 'index.html'), 'no-cache'))) return;

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden');
  }

  return createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
}
