import {
  buildSharedGhost,
  finishTime,
  ghostFromSamples,
  type BikeType,
  type LatLon,
  type SharedGhostData,
} from '@rechase/core';
import { api } from '../api.ts';
import { fmtDuration } from '../format.ts';
import { saveChallenge, saveRide, type StoredChallenge, type StoredRide, type StoredRoute } from '../db.ts';
import { toRoute, type Opponent } from '../routes.ts';
import { privacyPrefs } from './privacy.svelte.ts';

/** Ghosts teilen und fremde Ghosts übernehmen (E11, E18). */

/** Ein eigener Challenge-Link, wie ihn der Server liefert */
export interface GhostLink {
  code: string;
  url: string;
  rideId: string;
  name: string;
  length: number;
  time: number;
  day: string;
  createdAt: number;
  views: number;
}

/** Ein fremder Ghost, wie ihn der Server unter /api/ghosts/<code> liefert */
export interface RemoteChallenge extends SharedGhostData {
  code: string;
  url: string;
  chaser: string;
  sharedAt: number;
}

const dayLabel = (t: number) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

/**
 * Was eine Fahrt teilt: Ist sie eine gemerkte Strecke ganz gefahren, deren Strecke, bei einer Antwort auf eine
 * Challenge deren Strecke, sonst die ganze Fahrt. Die Strecke einer Challenge ist schon gekürzt und beginnt nicht
 * bei mir; dort gelten nur meine festen Zonen.
 */
export function shareSource(
  ride: StoredRide,
  route: StoredRoute | null,
  challenge: StoredChallenge | null,
): { name: string; points: readonly LatLon[]; trim: boolean } {
  if (route && ride.routeId === route.id && ride.routeTime != null) return { name: route.name, points: route.points, trim: true };
  if (challenge && ride.challengeId === challenge.id && ride.challengeTime != null) {
    return { name: challenge.name, points: challenge.points, trim: false };
  }
  return { name: route?.name ?? `Runde vom ${dayLabel(ride.startedAt)}`, points: ride.samples.filter((s) => s.moving), trim: true };
}

/** Baut den Ghost zum Teilen mit den Privatzonen dieses Geräts */
export function prepareShare(ride: StoredRide, source: ReturnType<typeof shareSource>, bike: BikeType | null) {
  const privacy = privacyPrefs.options(ride.id);
  return buildSharedGhost({
    name: source.name,
    points: source.points,
    samples: ride.samples,
    bike: ride.bike ?? bike,
    startedAt: ride.startedAt,
    privacy: { ...privacy, trim: privacy.trim && source.trim },
  });
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Legt den Challenge-Link an; dieselbe Fahrt bekommt immer denselben Link. */
export async function publishShare(rideId: string, ghost: SharedGhostData, image: Blob | null): Promise<GhostLink> {
  const body = { rideId, ghost, ...(image ? { image: await toBase64(image) } : {}) };
  return (await api<{ ghost: GhostLink }>('POST', '/api/ghosts', body)).ghost;
}

export const myLinks = async () => (await api<{ ghosts: GhostLink[] }>('GET', '/api/ghosts')).ghosts;
export const revokeLink = (code: string) => api('DELETE', `/api/ghosts/${code}`, {});
export const fetchChallenge = (code: string) => api<RemoteChallenge>('GET', `/api/ghosts/${code}`);

/** Übernimmt einen fremden Ghost; eigene Zeiten von früher bleiben erhalten. */
export async function importChallenge(r: RemoteChallenge, existing?: StoredChallenge): Promise<StoredChallenge> {
  const c: StoredChallenge = {
    id: r.code,
    url: r.url,
    name: r.name,
    chaser: r.chaser,
    bike: r.bike,
    day: r.day,
    points: r.points,
    length: r.length,
    ghost: r.ghost,
    time: r.time,
    profile: r.profile,
    importedAt: existing?.importedAt ?? Date.now(),
    attempts: existing?.attempts ?? 0,
    ...(existing?.bestTime != null ? { bestTime: existing.bestTime, bestRideId: existing.bestRideId } : {}),
  };
  await saveChallenge(c);
  return c;
}

/** Die Strecke einer Challenge in der Form, die Duell und Karte erwarten */
export function challengeRoute(c: StoredChallenge): StoredRoute {
  return {
    id: `challenge:${c.id}`,
    name: c.name,
    createdAt: c.importedAt,
    points: c.points,
    length: c.length,
    bestRideId: '',
    bestTime: c.time,
    bestAt: Date.parse(c.day),
    attempts: c.attempts,
  };
}

export function challengeOpponent(c: StoredChallenge): Opponent {
  return { ghost: c.ghost, short: c.chaser, label: `den Ghost von ${c.chaser}`, time: c.time, profile: c.profile };
}

export interface ChallengeResult {
  challenge: StoredChallenge;
  /** Eigene Bewegungszeit auf der Strecke in ms, null wenn nicht zu Ende gefahren */
  time: number | null;
  /** Eigene Bestzeit vor dieser Fahrt */
  previousBest: number | null;
  won: boolean;
  /** false: Die Fahrt ist auffällig und zählt nicht */
  counted: boolean;
}

/** Wertet eine Fahrt gegen eine Challenge aus und merkt die eigene Bestzeit darauf. */
export async function evaluateChallenge(
  ride: StoredRide,
  c: StoredChallenge,
  counts: boolean,
): Promise<ChallengeResult> {
  const route = toRoute(challengeRoute(c));
  const time = finishTime(route, ghostFromSamples(route, ride.samples));
  await saveRide({ ...ride, challengeId: c.id, challengeTime: time });
  if (time == null || !counts) return { challenge: c, time, previousBest: c.bestTime ?? null, won: false, counted: counts };
  const better = c.bestTime == null || time < c.bestTime;
  const updated: StoredChallenge = {
    ...c,
    attempts: c.attempts + 1,
    ...(better ? { bestTime: time, bestRideId: ride.id } : {}),
  };
  await saveChallenge(updated);
  return { challenge: updated, time, previousBest: c.bestTime ?? null, won: time < c.time, counted: true };
}

/** Text zum Link, z. B. für Messenger und die Strava-Beschreibung */
export function challengeText(opts: { name: string; time: number; replyTo?: string | null; won?: boolean }) {
  const lead = opts.replyTo
    ? `Re: ${opts.replyTo} · ${opts.name} in ${fmtDuration(opts.time)}${opts.won ? ', dein Ghost ist geschlagen' : ''}.`
    : `${opts.name} in ${fmtDuration(opts.time)} Bewegungszeit.`;
  return `${lead} Challenge me: Jag meinen Ghost auf re:chase, Ampelstopps zählen nicht.`;
}

/** Lädt die Fahrt zu Strava hoch und wartet kurz, bis Strava sie verarbeitet hat. */
export async function uploadToStrava(opts: { rideId: string; gpx: string; name: string; description: string }) {
  const { uploadId } = await api<{ uploadId: string }>('POST', '/api/strava/uploads', {
    gpx: opts.gpx,
    externalId: opts.rideId,
    name: opts.name,
    description: opts.description,
  });
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await api<{ done: boolean; activityUrl: string | null; error: string | null }>(
      'GET',
      `/api/strava/uploads/${uploadId}`,
    ).catch(() => null);
    if (s?.done) return s;
  }
  return { done: false, activityUrl: null, error: null };
}
