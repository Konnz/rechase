import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { CODE_ALPHABET, CODE_LENGTH, challengeCodeFromPath, parseSharedGhost } from '@rechase/core';
import type { createAccounts } from './accounts.ts';
import { baseUrl, checkOrigin, escapeHtml, HttpError, readJson, sendJson, str } from './http.ts';
import type { GhostRow, Store } from './store.ts';

/**
 * Geteilte Ghosts (E11, E12-3, E18-2) unter /api/ghosts und die Challenge-Links /c/<code>.
 * Wer den Link hat, sieht den Ghost; eine Liste aller Ghosts gibt es nicht. Die App kürzt Start und Ende
 * (Privatzonen) schon vor dem Hochladen, der Server bekommt die ungekürzte Fahrt also nie zu sehen.
 */

// Ein Ghost mit 20 000 Punkten ist als JSON rund 1,5 MB, dazu das Teilbild als Base64
const MAX_BODY = 6 * 1024 * 1024;
const MAX_IMAGE = 3 * 1024 * 1024;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface GhostsOptions {
  store: Store;
  accounts: ReturnType<typeof createAccounts>;
  publicUrl?: string;
  /** Ordner der gebauten App, für index.html mit Vorschau-Tags */
  publicDir: string;
}

function newCode() {
  const bytes = randomBytes(CODE_LENGTH);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

const fmtKm = (m: number) => (m / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function createGhosts({ store, accounts, publicUrl, publicDir }: GhostsOptions) {
  const linkOf = (req: IncomingMessage, code: string) => `${baseUrl(req, publicUrl)}/c/${code}`;

  const listItem = (req: IncomingMessage, g: GhostRow) => ({
    code: g.code,
    url: linkOf(req, g.code),
    rideId: g.rideId,
    name: g.name,
    length: g.length,
    time: g.time,
    day: g.day,
    createdAt: g.createdAt,
    views: g.views,
  });

  async function create(req: IncomingMessage, res: ServerResponse) {
    const user = accounts.requireUser(req);
    if (!user.name) throw new HttpError(403, 'Bitte erst im Profil einen Chaser-Namen wählen.');
    const body = await readJson(req, { maxBody: MAX_BODY });
    const rideId = str(body.rideId);
    if (!/^[\w-]{1,64}$/.test(rideId)) throw new HttpError(400, 'Ungültige Fahrt-ID.');
    const parsed = parseSharedGhost(body.ghost);
    if ('error' in parsed) throw new HttpError(400, parsed.error);
    let image: Buffer | null = null;
    if (body.image != null) {
      image = Buffer.from(str(body.image), 'base64');
      if (image.length > MAX_IMAGE || !image.subarray(0, 8).equals(PNG)) throw new HttpError(400, 'Ungültiges Bild.');
    }
    const g = parsed.ghost;
    const existing = store.ghostOfRide(user.id, rideId);
    let code = existing?.code ?? newCode();
    while (!existing && store.ghost(code)) code = newCode();
    store.putGhost(
      { code, userId: user.id, rideId, name: g.name, bike: g.bike, length: g.length, time: g.time, day: g.day },
      gzipSync(JSON.stringify(g)),
      image,
    );
    sendJson(res, existing ? 200 : 201, { ghost: listItem(req, store.ghost(code)!) });
  }

  function show(req: IncomingMessage, res: ServerResponse, code: string) {
    const row = store.ghost(code);
    const data = row && store.ghostData(code);
    if (!row || !data) throw new HttpError(404, 'Diese Challenge gibt es nicht mehr.');
    // Eigene Abrufe zählen nicht
    if (accounts.currentUser(req)?.id !== row.userId) store.countGhostView(code);
    sendJson(res, 200, {
      code,
      url: linkOf(req, code),
      chaser: row.chaser ?? 'Ein Chaser',
      sharedAt: row.createdAt,
      ...JSON.parse(gunzipSync(data).toString('utf8')),
    });
  }

  function remove(req: IncomingMessage, res: ServerResponse, code: string) {
    const user = accounts.requireUser(req);
    if (!store.deleteGhost(code, user.id)) throw new HttpError(404, 'Diese Challenge gibt es nicht.');
    sendJson(res, 200, { ok: true });
  }

  /** Vorschau-Tags (Open Graph) für einen Challenge-Link, oder '' wenn es ihn nicht gibt */
  function previewHead(req: IncomingMessage, code: string): string {
    const g = store.ghost(code);
    if (!g) return '';
    const title = `${g.chaser ?? 'Ein Chaser'} fordert dich heraus: ${g.name}`;
    const description = `${fmtKm(g.length)} km in ${fmtDuration(g.time)} Bewegungszeit. Jag den Ghost auf re:chase, Ampelstopps zählen nicht.`;
    const url = linkOf(req, code);
    const tags: [string, string][] = [
      ['og:type', 'website'],
      ['og:site_name', 're:chase'],
      ['og:title', title],
      ['og:description', description],
      ['og:url', url],
    ];
    if (g.hasImage) tags.push(['og:image', `${url}.png`], ['og:image:width', '1080'], ['og:image:height', '1350']);
    return [
      ...tags.map(([k, v]) => `<meta property="${k}" content="${escapeHtml(v)}">`),
      `<meta name="twitter:card" content="${g.hasImage ? 'summary_large_image' : 'summary'}">`,
      `<meta name="description" content="${escapeHtml(description)}">`,
    ].join('\n    ');
  }

  /** Bild für die Vorschau unter /c/<code>.png; frei zugänglich, auch hinter der PIN-Sperre */
  function image(res: ServerResponse, code: string) {
    const png = store.ghostImage(code);
    if (!png) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': png.length,
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(png);
  }

  /** Code aus /c/<code>.png, sonst null */
  const imageCode = (path: string) => (path.endsWith('.png') ? challengeCodeFromPath(path.slice(0, -4)) : null);

  /** true: Anfrage war für die API oder einen Challenge-Link und ist beantwortet */
  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const png = imageCode(url.pathname);
    if (png && (req.method === 'GET' || req.method === 'HEAD')) {
      image(res, png);
      return true;
    }
    const page = challengeCodeFromPath(url.pathname);
    if (page && (req.method === 'GET' || req.method === 'HEAD')) {
      // Die App selbst, mit Titel und Vorschau für Messenger; den Rest erledigt das Client-Routing
      const html = await readFile(join(publicDir, 'index.html'), 'utf8').catch(() => null);
      if (html == null) return false;
      const g = store.ghost(page);
      const head = previewHead(req, page);
      const title = g ? `<title>${escapeHtml(`Re: ${g.name} · re:chase`)}</title>` : '$&';
      const out = head
        ? html.replace(/<meta name="description"[^>]*>\s*/, '').replace(/<title>[^<]*<\/title>/, `${title}\n    ${head}`)
        : html;
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      });
      res.end(out);
      return true;
    }

    if (url.pathname !== '/api/ghosts' && !url.pathname.startsWith('/api/ghosts/')) return false;
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') checkOrigin(req);
      if (url.pathname === '/api/ghosts') {
        if (req.method === 'POST') await create(req, res);
        else if (req.method === 'GET') {
          const user = accounts.requireUser(req);
          sendJson(res, 200, { ghosts: store.ghostsOf(user.id).map((g) => listItem(req, g)) });
        } else throw new HttpError(405, 'Nur GET und POST.');
        return true;
      }
      const code = url.pathname.slice('/api/ghosts/'.length).toUpperCase();
      if (!challengeCodeFromPath(`/c/${code}`)) throw new HttpError(404, 'Diese Challenge gibt es nicht.');
      if (req.method === 'GET') show(req, res, code);
      else if (req.method === 'DELETE') remove(req, res, code);
      else throw new HttpError(405, 'Nur GET und DELETE.');
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      if (!res.headersSent) sendJson(res, err.status, { error: err.message });
      else res.end();
    }
    return true;
  }

  return { handle, previewHead, imageCode };
}
