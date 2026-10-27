import { buildRoute, finishTime, ghostFromSamples, type Ghost, type Route } from '@rechase/core';
import { getRide, saveRide, saveRoute, type StoredRide, type StoredRoute } from './db.ts';

/** Strecke für die Domänenlogik, die Distanzen werden aus den gespeicherten Punkten neu berechnet. */
export const toRoute = (r: StoredRoute): Route => buildRoute(r.points, 0);

/** Bewegungszeit einer Fahrt von Start bis Ziel der Strecke, oder null. */
export const timeOnRoute = (route: Route, ride: StoredRide) => finishTime(route, ghostFromSamples(route, ride.samples));

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

/** Der Ghost einer Strecke: die Bestzeit-Fahrt, auf die Strecke projiziert. */
export async function loadGhost(route: StoredRoute): Promise<Ghost | null> {
  const ride = await getRide(route.bestRideId);
  return ride ? ghostFromSamples(toRoute(route), ride.samples) : null;
}

export interface RideResult {
  route: StoredRoute;
  /** Bewegungszeit auf der Strecke in ms */
  time: number;
  /** Bestzeit vor dieser Fahrt in ms */
  previousBest: number;
  newBest: boolean;
}

/**
 * Vergleicht eine beendete Fahrt mit der Bestzeit und übernimmt sie, wenn sie schneller war.
 * Ohne vorgegebene Strecke werden alle gemerkten Strecken geprüft, die erste, die ganz gefahren wurde, zählt.
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
    const newBest = time < route.bestTime;
    const updated: StoredRoute = {
      ...route,
      attempts: route.attempts + 1,
      ...(newBest ? { bestRideId: ride.id, bestTime: time, bestAt: ride.startedAt } : {}),
    };
    await saveRoute(updated);
    await saveRide({ ...ride, routeId: route.id, routeTime: time });
    return { route: updated, time, previousBest: route.bestTime, newBest };
  }
  return null;
}
