import {
  averageGhost,
  bestSectionTimes,
  buildRoute,
  checkPlausibility,
  elevationProfile,
  finishTime,
  ghostFromSamples,
  sectionBounds,
  type ElevationProfile,
  type Ghost,
  type Plausibility,
  type Route,
} from '@rechase/core';
import { getRide, saveRide, saveRoute, type StoredRide, type StoredRoute } from './db.ts';

/** Strecke für die Domänenlogik, die Distanzen werden aus den gespeicherten Punkten neu berechnet. */
export const toRoute = (r: StoredRoute): Route => buildRoute(r.points, 0);

/** Bewegungszeit einer Fahrt von Start bis Ziel der Strecke, oder null. */
export const timeOnRoute = (route: Route, ride: StoredRide) => finishTime(route, ghostFromSamples(route, ride.samples));

const checks = new WeakMap<StoredRide, Plausibility>();

/** Plausibilität einer Fahrt mit dem gewählten Rad (Anti-Cheat Stufe 1), je Fahrt nur einmal berechnet. */
export function rideCheck(ride: StoredRide): Plausibility {
  let c = checks.get(ride);
  if (!c) checks.set(ride, (c = checkPlausibility(ride.samples, ride.bike)));
  return c;
}

/** Zählt die Fahrt für Bestzeiten und Ghosts? Auffällige Fahrten erst nach Widerspruch. */
export const rideCounts = (ride: StoredRide) => ride.appealedAt != null || rideCheck(ride).ok;

/** Merkt eine beendete Fahrt als Strecke; sie ist zugleich die erste Bestzeit. */
export async function createRoute(ride: StoredRide, name: string): Promise<StoredRoute> {
  const route = buildRoute(ride.samples.filter((s) => s.moving));
  const time = finishTime(route, ghostFromSamples(route, ride.samples)) ?? ride.samples.at(-1)?.movingTime ?? 0;
  const stored: StoredRoute = {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    points: route.points,
    length: route.length,
    bestRideId: ride.id,
    bestTime: time,
    bestAt: ride.startedAt,
    attempts: 1,
  };
  await saveRoute(stored);
  await saveRide({ ...ride, routeId: stored.id, routeTime: time });
  return stored;
}

/** Gegen welchen eigenen Ghost man fährt */
export type GhostMode = 'best' | 'last' | 'average';

/** So viele letzte Fahrten fließen in den Durchschnitt ein */
export const AVERAGE_OF = 5;

export interface Opponent {
  ghost: Ghost;
  /** Kurzname für Namensschild und Kacheln, z. B. „Bestzeit“ */
  short: string;
  /** Für die Kopfzeile, z. B. „deine Bestzeit vom 14.09.“ */
  label: string;
  /** Zielzeit des Ghosts in ms */
  time: number;
  /** Höhenprofil der Strecke, falls die Fahrt Höhen hat */
  profile: ElevationProfile | null;
}

/** Fahrten, die die Strecke ganz gefahren sind, die neueste zuerst. */
export function completedRides(route: StoredRoute, rides: readonly StoredRide[]): StoredRide[] {
  return rides
    .filter((r) => r.id === route.bestRideId || (r.routeId === route.id && r.routeTime != null && rideCounts(r)))
    .sort((a, b) => b.startedAt - a.startedAt);
}

const dayOf = (t: number) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

/** Der Ghost einer Strecke im gewählten Modus: Bestzeit, letzte Fahrt oder Durchschnitt der letzten Fahrten. */
export async function loadOpponent(
  route: StoredRoute,
  mode: GhostMode,
  rides: readonly StoredRide[],
): Promise<Opponent | null> {
  const r = toRoute(route);
  const done = completedRides(route, rides);
  const best = done.find((x) => x.id === route.bestRideId) ?? (await getRide(route.bestRideId));
  if (!best) return null;
  const profile = elevationProfile(r, best.samples);
  if (mode === 'last' && done.length) {
    const last = done[0];
    const ghost = ghostFromSamples(r, last.samples);
    return { ghost, short: 'Letzte Fahrt', label: `deine letzte Fahrt vom ${dayOf(last.startedAt)}`, time: finishTime(r, ghost) ?? 0, profile };
  }
  if (mode === 'average' && done.length > 1) {
    const used = done.slice(0, AVERAGE_OF);
    const ghost = averageGhost(used.map((x) => ghostFromSamples(r, x.samples)));
    return { ghost, short: 'Durchschnitt', label: `deinen Durchschnitt aus ${used.length} Fahrten`, time: finishTime(r, ghost) ?? 0, profile };
  }
  return {
    ghost: ghostFromSamples(r, best.samples),
    short: 'Bestzeit',
    label: `deine Bestzeit vom ${dayOf(route.bestAt)}`,
    time: route.bestTime,
    profile,
  };
}

/**
 * Bisher beste Zeit je Abschnitt der Strecke aus allen Fahrten darauf, auch abgebrochenen.
 * Grundlage für Abschnitts-PRs während der Fahrt.
 */
export function sectionBestsFor(route: StoredRoute, rides: readonly StoredRide[]): (number | null)[] {
  const r = toRoute(route);
  const bounds = sectionBounds(r.length);
  if (!bounds.length) return [];
  const on = rides.filter((x) => x.id === route.bestRideId || (x.routeId === route.id && rideCounts(x)));
  return bestSectionTimes(
    on.map((x) => ghostFromSamples(r, x.samples)),
    bounds,
  );
}

export interface RideResult {
  route: StoredRoute;
  /** Bewegungszeit auf der Strecke in ms */
  time: number;
  /** Bestzeit vor dieser Fahrt in ms */
  previousBest: number;
  newBest: boolean;
  /** false: Die Fahrt ist auffällig und zählt nicht, die Bestzeit bleibt unberührt */
  counted: boolean;
}

/**
 * Vergleicht eine beendete Fahrt mit der Bestzeit und übernimmt sie, wenn sie schneller war.
 * Ohne vorgegebene Strecke werden alle gemerkten Strecken geprüft, die erste, die ganz gefahren wurde, zählt.
 * Eine auffällige Fahrt wird der Strecke zugeordnet, zählt aber weder als Fahrt noch als Bestzeit.
 */
export async function evaluateRide(ride: StoredRide, routes: StoredRoute[]): Promise<RideResult | null> {
  const candidates = ride.routeId ? routes.filter((r) => r.id === ride.routeId) : routes;
  for (const route of candidates) {
    if (route.bestRideId === ride.id) continue;
    const time = timeOnRoute(toRoute(route), ride);
    if (time == null) {
      if (ride.routeId) await saveRide({ ...ride, routeTime: null });
      continue;
    }
    if (!rideCounts(ride)) {
      await saveRide({ ...ride, routeId: route.id, routeTime: time });
      return { route, time, previousBest: route.bestTime, newBest: false, counted: false };
    }
    const newBest = time < route.bestTime;
    const updated: StoredRoute = {
      ...route,
      attempts: route.attempts + 1,
      ...(newBest ? { bestRideId: ride.id, bestTime: time, bestAt: ride.startedAt } : {}),
    };
    await saveRoute(updated);
    await saveRide({ ...ride, routeId: route.id, routeTime: time });
    return { route: updated, time, previousBest: route.bestTime, newBest, counted: true };
  }
  return null;
}
