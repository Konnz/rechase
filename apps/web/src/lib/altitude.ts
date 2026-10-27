import { Geoid } from '@rechase/core';
import geoidUrl from '@rechase/core/data/egm96-1deg.bin?url';

/**
 * Safari (auch Chrome auf dem iPhone, das WebKit nutzt) liefert die Höhe schon über dem Meeresspiegel.
 * Android-Browser liefern sie wie in der Geolocation-Spezifikation über dem WGS84-Ellipsoid.
 * iPads melden sich als Macintosh.
 */
export const altitudeIsEllipsoidal = (ua = navigator.userAgent) => !/iPhone|iPad|iPod|Macintosh/.test(ua);

let loading: Promise<Geoid | null> | null = null;

/** Lädt das Geoid-Raster (130 KB, vom Service Worker vorgehalten). Null, wenn es nicht geladen werden kann. */
export function loadGeoid(): Promise<Geoid | null> {
  loading ??= fetch(geoidUrl)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((buf) => new Geoid(buf))
    .catch((e) => {
      console.error('Geoid-Raster konnte nicht geladen werden', e);
      loading = null;
      return null;
    });
  return loading;
}
