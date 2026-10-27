import { mkdtemp, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AppOptions } from '../src/app.ts';
import { openStore } from '../src/store.ts';

/** Startet den Server mit leerer Datenbank im Speicher. */
export async function startServer(options: Partial<AppOptions> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'rechase-'));
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>re:chase</title>');
  const store = openStore(':memory:');
  const server = createApp({ publicDir: dir, version: 'test', store, ...options }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    store,
    close() {
      server.close();
      store.close();
    },
  };
}

/** Kleiner Browser: merkt sich Cookies zwischen Anfragen. */
export function client(base: string) {
  const jar = new Map<string, string>();
  async function call(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; data: any; res: Response }> {
    const raw = body instanceof Uint8Array;
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
        ...headers,
      },
      body: body === undefined ? undefined : raw ? new Uint8Array(body) : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const [k, v] = pair!.split('=');
      if (attrs.some((a) => a.trim() === 'Max-Age=0')) jar.delete(k!);
      else jar.set(k!, v!);
    }
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    return { status: res.status, data, res };
  }
  return { call, jar };
}
