import type { IncomingMessage, ServerResponse } from 'node:http';
import { gunzipSync } from 'node:zlib';

/** Gemeinsame Bausteine der API: Fehler mit Status, JSON lesen und schreiben, Cookies, Origin-Prüfung. */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function cookies(req: IncomingMessage) {
  const out = new Map<string, string>();
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return out;
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string | string[]> = {},
) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

export interface ReadJsonOptions {
  /** Größte erlaubte Anfrage in Bytes, wie sie über die Leitung kommt */
  maxBody?: number;
  /** Größter erlaubter Inhalt nach dem Entpacken (nur mit Content-Encoding: gzip) */
  maxUnpacked?: number;
}

/** Liest einen JSON-Körper; mit Content-Encoding: gzip wird er vorher entpackt. */
export async function readJson(
  req: IncomingMessage,
  { maxBody = 16 * 1024, maxUnpacked = maxBody }: ReadJsonOptions = {},
): Promise<Record<string, unknown>> {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
    throw new HttpError(415, 'Bitte JSON schicken.');
  }
  const encoding = req.headers['content-encoding'];
  if (encoding && encoding !== 'gzip' && encoding !== 'identity') throw new HttpError(415, 'Unbekannte Kodierung.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > maxBody) throw new HttpError(413, 'Anfrage zu groß.');
    chunks.push(chunk);
  }
  let body: string;
  try {
    const buf = Buffer.concat(chunks);
    body = (encoding === 'gzip' ? gunzipSync(buf, { maxOutputLength: maxUnpacked }) : buf).toString('utf8');
  } catch {
    throw new HttpError(encoding === 'gzip' ? 413 : 400, 'Anfrage nicht lesbar oder zu groß.');
  }
  try {
    const data: unknown = body ? JSON.parse(body) : {};
    if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;
  } catch {
    // unten
  }
  throw new HttpError(400, 'Ungültiges JSON.');
}

/** Ändernde Anfragen nur vom eigenen Origin (Browser schicken Origin bei POST, PUT, PATCH, DELETE immer mit). */
export function checkOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return;
  const host = req.headers.host;
  let originHost = '';
  try {
    originHost = new URL(origin).host;
  } catch {
    // unten
  }
  if (originHost !== host) throw new HttpError(403, 'Fremder Origin.');
}

export const str = (v: unknown) => (typeof v === 'string' ? v : '');
