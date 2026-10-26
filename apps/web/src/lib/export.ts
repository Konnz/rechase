import type { StoredRide } from './db.ts';

const iso = (t: number) => new Date(t).toISOString();

export function toGpx(ride: StoredRide): string {
  const pts = ride.samples
    .map(
      (p) =>
        `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">` +
        (p.alt != null ? `<ele>${p.alt.toFixed(1)}</ele>` : '') +
        `<time>${iso(p.t)}</time></trkpt>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="re:chase" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>re:chase ${iso(ride.startedAt)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

/** Rohdaten für den Vergleich im Tech-Spike: jeder GPS-Punkt mit Genauigkeit und gemeldeter Geschwindigkeit. */
export function toCsv(ride: StoredRide): string {
  const head = 'time,lat,lon,alt,speed_ms,accuracy_m';
  const rows = ride.raw.map((p) => [iso(p.t), p.lat, p.lon, p.alt ?? '', p.speed ?? '', p.accuracy].join(','));
  return [head, ...rows].join('\n') + '\n';
}

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
