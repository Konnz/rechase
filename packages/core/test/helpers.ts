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

/**
 * Liest die Punkte einer re:chase-GPX-Datei. Fehlen Geschwindigkeit und Genauigkeit (ältere Exporte),
 * rechnet der Tracker die Geschwindigkeit aus den Positionen und die Genauigkeit gilt als gut.
 */
export function parseGpx(xml: string): TrackPoint[] {
  const num = (s: string, tag: string) => {
    const m = s.match(new RegExp(`<rc:${tag}>([-\\d.]+)</rc:${tag}>`));
    return m ? Number(m[1]) : null;
  };
  return [...xml.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)">([\s\S]*?)<\/trkpt>/g)].map(([, lat, lon, body]) => {
    const ele = body!.match(/<ele>([-\d.]+)<\/ele>/);
    return {
      t: Date.parse(body!.match(/<time>([^<]+)<\/time>/)![1]!),
      lat: Number(lat),
      lon: Number(lon),
      alt: ele ? Number(ele[1]) : null,
      speed: num(body!, 'gnssSpeed'),
      accuracy: num(body!, 'accuracy') ?? 5,
    };
  });
}
