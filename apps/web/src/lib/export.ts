import type { StoredRide } from './db.ts';

const iso = (t: number) => new Date(t).toISOString();

/**
 * GPX der angenommenen Punkte. In den Extensions stehen die Geschwindigkeit vom GNSS-Chip (fehlt sie,
 * gibt es kein gnssSpeed) und die Genauigkeit, damit sich Auto-Pause und Top Speed an echten Fahrten nachprüfen lassen.
 */
export function toGpx(ride: StoredRide): string {
  const gnssSpeed = new Map(ride.raw.map((p) => [p.t, p.speed]));
  const pts = ride.samples
    .map((p) => {
      const gnss = gnssSpeed.get(p.t);
      return (
        `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">` +
        (p.alt != null ? `<ele>${p.alt.toFixed(1)}</ele>` : '') +
        `<time>${iso(p.t)}</time>` +
        `<extensions><rc:speed>${p.speed.toFixed(2)}</rc:speed>` +
        (gnss != null ? `<rc:gnssSpeed>${gnss.toFixed(2)}</rc:gnssSpeed>` : '') +
        `<rc:accuracy>${p.accuracy.toFixed(1)}</rc:accuracy><rc:moving>${p.moving ? 1 : 0}</rc:moving></extensions>` +
        `</trkpt>`
      );
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="re:chase" xmlns="http://www.topografix.com/GPX/1/1" xmlns:rc="urn:rechase:gpx:1">
  <trk>
    <name>re:chase ${iso(ride.startedAt)}</name>
    <type>cycling</type>
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
