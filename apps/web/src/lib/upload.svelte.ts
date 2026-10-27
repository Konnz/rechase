import type { RideUpload } from '@rechase/core';
import { account } from './account/account.svelte.ts';
import { API_BASE, answer, ApiError } from './api.ts';
import {
  clearUploadMarks,
  listRides,
  listRoutes,
  listUploadMarks,
  saveUploadMark,
} from './db.ts';
import { fingerprint, toUpload, uploadable } from './rideUpload.ts';

/**
 * Feldtest (E22-2): Mit Einwilligung gehen beendete Fahrten automatisch an den Server.
 * Ohne Netz bleibt eine Fahrt einfach offen und geht beim nächsten Anlass mit (App geöffnet, wieder online).
 * Welche Fassung einer Fahrt schon oben ist, merkt sich das Gerät als Fingerabdruck; ändert sich etwa das Rad,
 * geht sie noch einmal hoch.
 */

/** Packt mit gzip, wo der Browser es kann (Chrome 80+, Safari 16.4+) */
async function gzip(text: string): Promise<Blob | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    return await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  } catch {
    return null;
  }
}

async function put(ride: RideUpload) {
  const json = JSON.stringify(ride);
  const packed = await gzip(json);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/rides/${encodeURIComponent(ride.id)}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(packed ? { 'Content-Encoding': 'gzip' } : {}) },
      body: packed ?? json,
    });
  } catch {
    throw new Error('Keine Verbindung, die Fahrten gehen später hoch.');
  }
  await answer(res);
}

class Uploader {
  /** Fahrten, die noch hochgeladen werden müssen */
  pending = $state(0);
  busy = $state(false);
  error = $state<string | null>(null);
  private again = false;

  /** Lädt alle offenen Fahrten hoch, wenn eingewilligt. Mehrfache Aufrufe laufen nacheinander. */
  async sync(): Promise<void> {
    const user = account.user;
    if (!user?.testConsent) return;
    if (this.busy) {
      this.again = true;
      return;
    }
    this.busy = true;
    let sent = 0;
    try {
      const [rides, routes, marks] = await Promise.all([listRides(), listRoutes(), listUploadMarks()]);
      const done = new Map(marks.map((m) => [m.id, m.fingerprint]));
      // Älteste zuerst
      const todo = rides.filter((r) => uploadable(r) && done.get(r.id) !== fingerprint(r, user.id)).reverse();
      this.pending = todo.length;
      for (const r of todo) {
        await put(toUpload(r, routes));
        await saveUploadMark({ id: r.id, fingerprint: fingerprint(r, user.id), at: Date.now() });
        this.pending--;
        sent++;
      }
      this.error = null;
    } catch (err) {
      this.error = (err as Error).message;
      // Einwilligung anderswo zurückgezogen oder abgemeldet: Konto neu laden, dann hört der Upload auf
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) sent++;
    } finally {
      this.busy = false;
    }
    if (sent) await account.load();
    if (this.again) {
      this.again = false;
      await this.sync();
    }
  }

  /** Einwilligung geben oder zurückziehen. Beim Widerruf löscht der Server die hochgeladenen Fahrten. */
  async consent(yes: boolean) {
    await account.update({ testConsent: yes });
    if (!yes) {
      this.pending = 0;
      this.error = null;
      await clearUploadMarks().catch(() => {});
    } else void this.sync();
  }
}

export const uploader = new Uploader();
