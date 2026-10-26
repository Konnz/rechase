import { mkdtemp, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';

let base = '';
let close = () => {};

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rechase-pin-'));
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>re:chase app</title>');
  await writeFile(join(dir, 'manifest.webmanifest'), '{}');
  const server = createApp({ publicDir: dir, version: 'test', pin: '1520' }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});

afterAll(() => close());

const page = (path = '/', cookie = '') =>
  fetch(`${base}${path}`, { headers: { accept: 'text/html', ...(cookie && { cookie }) }, redirect: 'manual' });

const login = (pin: string, ip = '10.0.0.1') =>
  fetch(`${base}/pin`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': ip },
    body: new URLSearchParams({ pin }),
    redirect: 'manual',
  });

describe('PIN-Sperre', () => {
  it('zeigt ohne Cookie das PIN-Formular statt der App', async () => {
    const res = await page();
    expect(res.status).toBe(401);
    const html = await res.text();
    expect(html).toContain('name="pin"');
    expect(html).not.toContain('re:chase app');
    expect(html).not.toContain('1520');
  });

  it('lässt Healthcheck und Manifest ohne PIN durch', async () => {
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect((await fetch(`${base}/manifest.webmanifest`)).status).toBe(200);
  });

  it('blockt Dateien ohne Cookie mit 401', async () => {
    expect((await fetch(`${base}/sw.js`)).status).toBe(401);
  });

  it('lehnt eine falsche PIN ab', async () => {
    const res = await login('0000');
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('setzt nach richtiger PIN ein Cookie, mit dem die App erreichbar ist', async () => {
    const res = await login('1520');
    expect(res.status).toBe(303);
    const cookie = res.headers.get('set-cookie')!.split(';')[0];
    expect(cookie).toMatch(/^rechase_pin=/);
    expect(cookie).not.toContain('1520');
    const app = await page('/', cookie);
    expect(app.status).toBe(200);
    expect(await app.text()).toContain('re:chase app');
  });

  it('akzeptiert kein ausgedachtes Cookie', async () => {
    expect((await page('/', 'rechase_pin=abc')).status).toBe(401);
  });

  it('sperrt nach zu vielen Fehlversuchen, auch die richtige PIN', async () => {
    for (let i = 0; i < 10; i++) await login('9999', '10.0.0.9');
    expect((await login('1520', '10.0.0.9')).status).toBe(429);
    // Andere Adressen sind nicht betroffen
    expect((await login('1520', '10.0.0.10')).status).toBe(303);
  });
});
