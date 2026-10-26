import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';

let base = '';
let close = () => {};

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rechase-'));
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>re:chase</title>');
  await mkdir(join(dir, 'assets'));
  await writeFile(join(dir, 'assets', 'app-abc.js'), 'console.log(1)');
  const server = createApp({ publicDir: dir, version: 'test' }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(() => close());

describe('Server', () => {
  it('antwortet auf /healthz ohne Login mit 200', async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: 'test' });
  });

  it('liefert gehashte Assets mit langem Cache', async () => {
    const res = await fetch(`${base}/assets/app-abc.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('fällt für App-Routen auf index.html zurück', async () => {
    const res = await fetch(`${base}/strecken/123`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('re:chase');
  });

  it('meldet fehlende Dateien mit 404', async () => {
    expect((await fetch(`${base}/fehlt.png`)).status).toBe(404);
  });

  it('lässt keinen Zugriff außerhalb des Ordners zu', async () => {
    const res = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
    expect([400, 404]).toContain(res.status);
  });
});
