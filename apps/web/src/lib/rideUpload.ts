import type { RideUpload } from '@rechase/core';
import type { StoredRide, StoredRoute } from './db.ts';

/** Was von einer Fahrt für den Feldtest hochgeht und wann (E22-2). */

/** Unbeendete Fahrten (Absturz, App geschlossen) gehen erst hoch, wenn so lange nichts mehr dazukam */
const STALE_MS = 6 * 3600 * 1000;

export function uploadable(ride: StoredRide, now = Date.now()): boolean {
  if (!ride.raw.length) return false;
  return ride.endedAt != null || now - ride.raw.at(-1)!.t > STALE_MS;
}

/** Ändert sich etwas davon, wird die Fahrt neu hochgeladen */
export const fingerprint = (ride: StoredRide, userId: string) =>
  JSON.stringify([
    userId,
    ride.endedAt,
    ride.raw.length,
    ride.routeId ?? null,
    ride.routeTime ?? null,
    ride.bike ?? null,
    ride.appealedAt ?? null,
  ]);

export function toUpload(ride: StoredRide, routes: readonly StoredRoute[]): RideUpload {
  const route = ride.routeId ? routes.find((r) => r.id === ride.routeId) : undefined;
  return {
    id: ride.id,
    startedAt: ride.startedAt,
    endedAt: ride.endedAt,
    raw: ride.raw,
    samples: ride.samples,
    gaps: ride.gaps,
    rejected: ride.rejected,
    hidden: ride.hidden,
    userAgent: ride.userAgent,
    device: ride.device,
    altitudeRef: ride.altitudeRef,
    bike: ride.bike,
    appealedAt: ride.appealedAt,
    duel: ride.duel,
    battery: ride.battery,
    route: route && {
      id: route.id,
      name: route.name,
      time: ride.routeTime ?? null,
      bestTime: route.bestTime,
      isBest: route.bestRideId === ride.id,
    },
  };
}
