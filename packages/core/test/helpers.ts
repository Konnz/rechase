import type { TrackPoint } from '../src/types.ts';

/** Erzeugt Punkte entlang eines Breitengrads: je Sekunde ein Punkt mit der angegebenen Geschwindigkeit (km/h). */
export function ride(speedsKmh: number[], { start = 0, accuracy = 5, withSpeed = true } = {}): TrackPoint[] {
  const metersPerDegLat = 111_195;
  let lat = 48.1;
  return speedsKmh.map((v, i) => {
    if (i > 0) lat += v / 3.6 / metersPerDegLat;
    return { t: start + i * 1000, lat, lon: 11.58, accuracy, speed: withSpeed ? v / 3.6 : null };
  });
}
